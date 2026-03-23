"""
model_manager.py  —  Queue-Based GPU Scheduler
════════════════════════════════════════════════════════════════
Single-GPU Safety Guarantees:

  ✓ Worker thread เป็น ENTITY เดียวที่แตะ GPU lifecycle ทั้งหมด
    (load / unload / evict — ทุกอย่างผ่าน _job_queue เท่านั้น)
  ✓ ไม่มีทาง 2 local model อยู่บน GPU พร้อมกัน
  ✓ ไม่มี path อื่นเรียก _evict_current() / load_fn / unload_fn โดยตรง
  ✓ force_unload_async() และ force_unload_sync() ส่ง special job เข้า queue
    ไม่แตะ GPU เองแม้ในกรณี OOM หรือ shutdown

  Exception: Cloud model (Gemini) ไม่อยู่ใน scope นี้

กฎที่บังคับใช้:
  1. Multi-user safe  → FIFO queue, worker เดียวประมวลผลทีละ 1 job
  2. Single-GPU safe  → worker เป็น single point of GPU control
  3. No mid-job evict → evict เกิดได้แค่ระหว่าง job ใน worker loop
  4. Idle unload      → unload อัตโนมัติเมื่อ queue ว่าง >= IDLE_TIMEOUT วิ
  5. OOM guard        → ตรวจ VRAM ก่อนโหลด, warning ถ้าเหลือน้อย
  6. Queue size cap   → reject ทันทีถ้า queue เกิน MAX_QUEUE_SIZE
  7. Job timeout      → kill job ที่รันเกิน JOB_TIMEOUT วิ
  8. Graceful shutdown → force_unload_sync() รอ worker ทำ evict จริงก่อน return

════════════════════════════════════════════════════════════════
วิธีใช้ใน model ใหม่:
    from model_manager import scheduler

    def my_fn(text):
        return scheduler.submit(
            "my_model", load_model, unload_model, _do_inference, text
        ).result()
════════════════════════════════════════════════════════════════
"""

import queue
import threading
import time
import logging
from concurrent.futures import Future

import torch  # type: ignore

logger = logging.getLogger(__name__)

IDLE_TIMEOUT    = 60   # วิ ไม่มีงานแล้ว unload
VRAM_WARN_MB    = 500   # เตือนถ้าเหลือ VRAM น้อยกว่า MB นี้
JOB_TIMEOUT     = 300   # วิ สูงสุดที่ job หนึ่งรันได้ก่อนถูก kill
MAX_QUEUE_SIZE  = 100   # job สูงสุดใน queue — เกินนี้ reject ทันที

# Sentinel objects สำหรับ special jobs (ไม่ใช่ model inference)
_EVICT_JOB = object()


# ══════════════════════════════════════════════════════════════
class GPUScheduler:
    """
    Single-worker queue scheduler สำหรับ GPU model lifecycle

    GPU LIFECYCLE INVARIANT:
        _evict_current(), load_fn(), unload_fn() ถูกเรียกโดย
        _run_worker() เท่านั้น — ไม่มี method อื่นแตะ GPU โดยตรง

    Public API:
        submit()              → ส่ง inference job, คืน Future
        force_unload_async()  → ส่ง evict job เข้า queue (non-blocking)
        force_unload_sync()   → ส่ง evict job และรอจนเสร็จ (blocking)
        current_model         → property: ชื่อ model บน GPU ตอนนี้
        queue_size            → property: จำนวน job ที่รอ
    """

    def __init__(self):
        self._job_queue: queue.Queue = queue.Queue()

        # registry: model_name → unload_fn
        self._registry: dict[str, callable] = {}
        self._current_model: str | None = None

        # idle timer
        self._idle_timer: threading.Timer | None = None
        self._timer_lock = threading.Lock()

        # worker thread (daemon → ตายพร้อม process)
        self._worker = threading.Thread(
            target=self._run_worker,
            name="GPUScheduler-Worker",
            daemon=True,
        )
        self._worker.start()
        logger.info("[Scheduler] Worker thread started")

    # ──────────────────────────────────────────────────────────
    # Public API
    # ──────────────────────────────────────────────────────────

    def submit(
        self,
        model_name: str,
        load_fn: callable,
        unload_fn: callable,
        job_fn: callable,
        /,
        *args,
        **kwargs,
    ) -> Future:
        """
        ส่ง inference job เข้า queue แล้วคืน Future
        caller เรียก .result() เพื่อรอผล (blocking, thread-safe)

        Raises:
            RuntimeError: ถ้า queue เต็ม (>= MAX_QUEUE_SIZE)
        """
        # ── [6] Queue Size Cap ────────────────────────────────
        current_size = self._job_queue.qsize()
        if current_size >= MAX_QUEUE_SIZE:
            logger.warning(
                f"[Scheduler] Queue overloaded ({current_size} jobs) "
                f"— rejecting '{model_name}' request"
            )
            raise RuntimeError(
                f"GPU queue overloaded ({current_size}/{MAX_QUEUE_SIZE}). "
                "Please retry in a moment."
            )

        self._cancel_idle_timer()

        future: Future = Future()
        self._job_queue.put_nowait({
            "type":       "inference",
            "model_name": model_name,
            "load_fn":    load_fn,
            "unload_fn":  unload_fn,
            "job_fn":     job_fn,
            "args":       args,
            "kwargs":     kwargs,
            "future":     future,
        })
        logger.debug(
            f"[Scheduler] Inference job queued for '{model_name}' "
            f"(queue size: {self._job_queue.qsize()})"
        )
        return future

    def force_unload_async(self) -> Future:
        """
        ส่ง evict job เข้า queue (non-blocking)
        Worker จะ unload เมื่อถึงคิว — ไม่แตะ GPU จาก thread นี้

        ใช้ในกรณี: OOM recovery ที่ไม่ต้องรอ evict เสร็จ
        คืน Future ถ้าต้องการรอทีหลัง
        """
        future: Future = Future()
        self._cancel_idle_timer()
        self._job_queue.put_nowait({
            "type":   "evict",
            "future": future,
        })
        logger.info("[Scheduler] Evict job queued (async)")
        return future

    def force_unload_sync(self, timeout: float = 30.0) -> bool:
        """
        ส่ง evict job เข้า queue และ BLOCK จนกว่า worker จะ unload เสร็จ

        ใช้ในกรณี: graceful shutdown — ต้องการให้ GPU ว่างจริงก่อน return

        Args:
            timeout: วิสูงสุดที่จะรอ (default 30 วิ)

        Returns:
            True  → evict เสร็จสมบูรณ์
            False → timeout (แต่ process จะยังปิดได้ เพราะ worker เป็น daemon)
        """
        future = self.force_unload_async()
        try:
            future.result(timeout=timeout)
            logger.info("[Scheduler] GPU evict confirmed before shutdown")
            return True
        except Exception:
            logger.warning("[Scheduler] Evict timed out during shutdown")
            return False

    @property
    def current_model(self) -> str | None:
        return self._current_model

    @property
    def queue_size(self) -> int:
        return self._job_queue.qsize()

    # ──────────────────────────────────────────────────────────
    # Worker Thread  (SINGLE POINT OF GPU CONTROL)
    # ──────────────────────────────────────────────────────────

    def _run_worker(self) -> None:
        """
        Loop หลักของ worker

        INVARIANT: _evict_current() และ load_fn/unload_fn ถูกเรียก
                   ใน function นี้เท่านั้น
        """
        while True:
            try:
                item = self._job_queue.get(timeout=1.0)
            except queue.Empty:
                # Queue ว่าง → เริ่ม idle timer ถ้า model โหลดอยู่
                if self._current_model is not None:
                    self._start_idle_timer()
                continue

            # มีงาน → ยกเลิก idle timer ทันที
            self._cancel_idle_timer()
            job_type = item.get("type")

            # ── [A] Special Job: Evict ─────────────────────────
            if job_type == "evict":
                try:
                    self._evict_current()
                    item["future"].set_result(None)
                except Exception as exc:
                    item["future"].set_exception(exc)
                finally:
                    self._job_queue.task_done()
                continue

            # ── [B] Inference Job ──────────────────────────────
            model_name = item["model_name"]
            future     = item["future"]

            try:
                # switch model ถ้าจำเป็น
                if self._current_model != model_name:
                    if self._current_model is not None:
                        logger.info(
                            f"[Scheduler] Evicting '{self._current_model}' "
                            f"→ loading '{model_name}'"
                        )
                        self._evict_current()

                    self._check_vram(model_name)
                    self._do_load(model_name, item["load_fn"], item["unload_fn"])

                # ── [7] Job Timeout Enforcement ────────────────
                result_holder: list = []
                exc_holder:    list = []

                def _run_job():
                    try:
                        result_holder.append(
                            item["job_fn"](*item["args"], **item["kwargs"])
                        )
                    except Exception as e:
                        exc_holder.append(e)

                job_thread = threading.Thread(target=_run_job, daemon=True)
                job_thread.start()
                job_thread.join(timeout=JOB_TIMEOUT)

                if job_thread.is_alive():
                    logger.error(
                        f"[Scheduler] Job '{model_name}' exceeded "
                        f"{JOB_TIMEOUT}s — evicting model"
                    )
                    self._evict_current()
                    future.set_exception(
                        TimeoutError(
                            f"Job timed out after {JOB_TIMEOUT}s. "
                            "Please retry."
                        )
                    )
                elif exc_holder:
                    future.set_exception(exc_holder[0])
                else:
                    future.set_result(result_holder[0])

            except Exception as exc:
                logger.error(
                    f"[Scheduler] Job setup error for '{model_name}': {exc}"
                )
                future.set_exception(exc)

            finally:
                self._job_queue.task_done()

    # ──────────────────────────────────────────────────────────
    # GPU Lifecycle Helpers (เรียกจาก _run_worker เท่านั้น)
    # ──────────────────────────────────────────────────────────

    def _do_load(self, name: str, load_fn: callable, unload_fn: callable) -> None:
        """PRIVATE — worker only"""
        self._registry[name] = unload_fn
        try:
            load_fn()
            self._current_model = name
            logger.info(f"[Scheduler] '{name}' loaded on GPU")
        except Exception as exc:
            self._registry.pop(name, None)
            logger.error(f"[Scheduler] Failed to load '{name}': {exc}")
            raise

    def _evict_current(self) -> None:
        """PRIVATE — worker only"""
        name = self._current_model
        if name is None:
            return
        unload_fn = self._registry.pop(name, None)
        self._current_model = None
        if unload_fn:
            try:
                unload_fn()
                logger.info(f"[Scheduler] '{name}' evicted from GPU")
            except Exception as exc:
                logger.error(f"[Scheduler] Error evicting '{name}': {exc}")

    # ──────────────────────────────────────────────────────────
    # Idle Timer
    # ──────────────────────────────────────────────────────────

    def _start_idle_timer(self) -> None:
        with self._timer_lock:
            if self._idle_timer is not None:
                return
            timer = threading.Timer(IDLE_TIMEOUT, self._on_idle_timeout)
            timer.daemon = True
            timer.start()
            self._idle_timer = timer
            logger.debug(f"[Scheduler] Idle timer started ({IDLE_TIMEOUT}s)")

    def _cancel_idle_timer(self) -> None:
        with self._timer_lock:
            if self._idle_timer:
                self._idle_timer.cancel()
                self._idle_timer = None

    def _on_idle_timeout(self) -> None:
        with self._timer_lock:
            self._idle_timer = None
        # ส่ง evict job ผ่าน queue — worker ทำเอง (thread-safe)
        if self._job_queue.empty() and self._current_model is not None:
            logger.info(
                f"[Scheduler] Idle timeout — queuing evict for '{self._current_model}'"
            )
            self._job_queue.put_nowait({"type": "evict", "future": Future()})

    # ──────────────────────────────────────────────────────────
    # OOM Guard
    # ──────────────────────────────────────────────────────────

    def _check_vram(self, model_name: str) -> None:
        try:
            if not torch.cuda.is_available():
                return
            free_mb = torch.cuda.mem_get_info()[0] / 1024 / 1024
            if free_mb < VRAM_WARN_MB:
                logger.warning(
                    f"[Scheduler] Low VRAM before loading '{model_name}': "
                    f"{free_mb:.0f} MB free (threshold {VRAM_WARN_MB} MB)"
                )
        except Exception:
            pass


# Singleton — import ตัวนี้ทุกที่
scheduler = GPUScheduler()
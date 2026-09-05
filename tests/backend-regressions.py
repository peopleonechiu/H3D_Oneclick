"""CPU-only boundary tests, not CUDA or PBR generation validation."""
import importlib.util
import pathlib
import sys
import tempfile
import unittest
import threading
from types import SimpleNamespace

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "runtime/backend"))
from local_paint import bind_local_paint
from server import HunyuanBackend


class BackendTests(unittest.TestCase):
    def test_local_paint_never_calls_remote_hub(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            (root / "hunyuan3d-paintpbr-v2-1").mkdir()
            (root / "hunyuan3d-paintpbr-v2-1/model_index.json").write_text('{}')
            original = SimpleNamespace(snapshot_download=lambda **kw: self.fail('remote download'))
            module = SimpleNamespace(huggingface_hub=original)
            bind_local_paint(module, root)
            self.assertEqual(module.huggingface_hub.snapshot_download(repo_id=str(root)), str(root))
            self.assertIsNot(module.huggingface_hub, original)
            with self.assertRaises(RuntimeError):
                module.huggingface_hub.snapshot_download(repo_id='tencent/Hunyuan3D-2.1')

    def test_empty_dino_does_not_enable_pbr(self):
        with tempfile.TemporaryDirectory() as directory:
            backend = HunyuanBackend(pathlib.Path(directory), pathlib.Path(directory))
            backend.hardware = lambda: {'textureSupported': True}
            self.assertFalse(backend.texture_capability())

    def test_shape_preserves_zero_and_requested_steps(self):
        with tempfile.TemporaryDirectory() as directory:
            backend = HunyuanBackend(pathlib.Path(directory), None)
            calls = []
            generator = SimpleNamespace(manual_seed=lambda seed: calls.append(('seed', seed)))
            backend._torch = SimpleNamespace(Generator=lambda **kwargs: generator)
            backend.shape_pipeline = lambda **kwargs: [calls.append(kwargs)]
            backend._run_shape('image', {'seed': 0, 'guidance_scale': 0, 'num_inference_steps': 40})
            self.assertIn(('seed', 0), calls)
            self.assertEqual(calls[-1]['guidance_scale'], 0)
            self.assertEqual(calls[-1]['num_inference_steps'], 40)

    def test_unload_waits_for_cancelled_generation(self):
        with tempfile.TemporaryDirectory() as directory:
            backend = HunyuanBackend(pathlib.Path(directory), None)
            backend.shape_pipeline = object()
            entered, finish, unloaded = threading.Event(), threading.Event(), threading.Event()
            errors = []
            def compute(payload, progress):
                entered.set()
                if not finish.wait(2):
                    raise RuntimeError('test timeout')
                backend._check_cancelled()
            backend._generate = compute
            def generate():
                try:
                    backend.generate({'job_id': 'job-1'})
                except Exception as exc:
                    errors.append(exc)
            def unload():
                backend.unload()
                unloaded.set()
            worker = threading.Thread(target=generate)
            worker.start()
            self.assertTrue(entered.wait(1))
            release = threading.Thread(target=unload)
            release.start()
            try:
                self.assertFalse(unloaded.wait(0.05))
                self.assertIsNotNone(backend.shape_pipeline)
                backend.cancel('job-1')
            finally:
                finish.set()
                worker.join(2)
                release.join(2)
            self.assertTrue(unloaded.is_set())
            self.assertEqual(errors[0].code, 'GENERATION_CANCELLED')


if __name__ == '__main__':
    unittest.main()

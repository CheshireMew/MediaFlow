import subprocess

from backend.services.runtime_diagnostics import RuntimeDiagnosticsService


def test_cuda_readiness_ready(tmp_path, monkeypatch):
    cuda_bin = tmp_path / "cuda" / "bin"
    cudnn_bin = tmp_path / "cudnn" / "bin"
    cuda_bin.mkdir(parents=True)
    cudnn_bin.mkdir(parents=True)
    (cuda_bin / RuntimeDiagnosticsService.CUDA_RUNTIME_DLL).write_text("")
    (cuda_bin / RuntimeDiagnosticsService.CUBLAS_DLL).write_text("")
    (cudnn_bin / RuntimeDiagnosticsService.CUDNN_DLL).write_text("")

    def fake_which(name):
        if name == "nvidia-smi":
            return "C:\\Windows\\System32\\nvidia-smi.exe"
        return None

    def fake_run(args, **kwargs):
        if args == ["C:\\Windows\\System32\\nvidia-smi.exe"]:
            return subprocess.CompletedProcess(args, 0, stdout="CUDA Version: 13.2", stderr="")
        return subprocess.CompletedProcess(
            args,
            0,
            stdout="NVIDIA GeForce RTX 2080 SUPER, 595.79\n",
            stderr="",
        )

    monkeypatch.setenv("PATH", f"{cuda_bin};{cudnn_bin}")
    monkeypatch.setattr("backend.services.runtime_diagnostics.shutil.which", fake_which)
    monkeypatch.setattr("backend.services.runtime_diagnostics.subprocess.run", fake_run)

    response = RuntimeDiagnosticsService().cuda_readiness()

    assert response.status == "ready"
    assert response.gpu_name == "NVIDIA GeForce RTX 2080 SUPER"
    assert response.driver_version == "595.79"
    assert response.driver_cuda_capability == "13.2"
    assert {item.status for item in response.dependencies} == {"ready"}


def test_cuda_readiness_reports_known_dlls_not_on_path(tmp_path, monkeypatch):
    program_files = tmp_path / "Program Files"
    cuda_bin = program_files / "NVIDIA GPU Computing Toolkit" / "CUDA" / "v12.8" / "bin"
    cudnn_bin = program_files / "NVIDIA" / "CUDNN" / "v9.11" / "bin" / "12.8"
    cuda_bin.mkdir(parents=True)
    cudnn_bin.mkdir(parents=True)
    (cuda_bin / RuntimeDiagnosticsService.CUDA_RUNTIME_DLL).write_text("")
    (cuda_bin / RuntimeDiagnosticsService.CUBLAS_DLL).write_text("")
    (cudnn_bin / RuntimeDiagnosticsService.CUDNN_DLL).write_text("")

    def fake_which(name):
        if name == "nvidia-smi":
            return "C:\\Windows\\System32\\nvidia-smi.exe"
        return None

    def fake_run(args, **kwargs):
        if args == ["C:\\Windows\\System32\\nvidia-smi.exe"]:
            return subprocess.CompletedProcess(args, 0, stdout="CUDA Version: 13.2", stderr="")
        return subprocess.CompletedProcess(args, 0, stdout="GPU, 595.79\n", stderr="")

    monkeypatch.setenv("ProgramFiles", str(program_files))
    monkeypatch.setenv("PATH", "")
    monkeypatch.setattr("backend.services.runtime_diagnostics.shutil.which", fake_which)
    monkeypatch.setattr("backend.services.runtime_diagnostics.subprocess.run", fake_run)

    response = RuntimeDiagnosticsService().cuda_readiness()
    statuses = {item.key: item.status for item in response.dependencies}

    assert response.status == "not_ready"
    assert statuses["cuda_runtime"] == "not_on_path"
    assert statuses["cublas"] == "not_on_path"
    assert statuses["cudnn"] == "not_on_path"
    assert any("Restart the backend" in item for item in response.install_guidance)

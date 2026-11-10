import sys
from pathlib import Path

# Чтобы тесты находили пакет aci_ml при запуске из любой папки.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

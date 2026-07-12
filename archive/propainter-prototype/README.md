# Archived ProPainter prototype

The ProPainter setup and import-debug scripts were moved here on 2026-07-10.
The application never contained the runtime wrapper they imported, the setup
script installed files outside the backend package, and its model path did not
match the application model directory. Consequently the advertised UI option
always failed at runtime.

The active cleanup feature now exposes only the two implemented and validated
OpenCV methods. These scripts are retained solely as historical prototypes.

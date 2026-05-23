@echo off
cd /d "e:\Ptoyecto Cerco Ubicacion"
echo Iniciando el servidor de Radar Familiar...
start npm run dev
timeout /t 4
start http://localhost:5173

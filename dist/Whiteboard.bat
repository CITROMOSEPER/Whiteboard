@echo off
rem Opens Whiteboard.html (in this same folder) in its own app window, without browser tabs or address bar.
rem Uses Edge, which every Windows PC has; falls back to Chrome.
set "PAGE=%~dp0Whiteboard.html"
set "URL=file:///%PAGE:\=/%"
start "" msedge --app="%URL%" || start "" chrome --app="%URL%"

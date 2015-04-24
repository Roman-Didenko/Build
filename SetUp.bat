COPY "%~dp0Build.bat" "%~dp0../"
COPY "%~dp0Package.bat" "%~dp0../"
COPY %~dp0Test.bat "%~dp0../"
IF NOT EXIST "%~dp0../version.json" COPY "%~dp0version.json" "%~dp0../"

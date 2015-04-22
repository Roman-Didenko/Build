COPY Build.bat "../"
COPY Package.bat "../"
COPY Test.bat "../"
IF NOT EXIST ../version.json COPY version.json "../"

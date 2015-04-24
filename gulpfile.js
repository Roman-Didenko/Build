var gulp = require('gulp');
var args = require('yargs').argv;
var eventStream = require('event-stream');
var nuget = require('nuget-runner')({ nugetPath: 'nuget.exe' });
var fs = require('fs');
var path = require('path');

var rootDir = path.dirname(__dirname);
var outputDir = path.join(rootDir, 'Output');
var artifactsDir = path.join(outputDir, 'Artifacts');

var buildVersion = require(rootDir + '/version.json').version + '.' + args.buildNumber;


gulp.task('clean', function() {
	require('rimraf').sync(outputDir + '/*');
});

gulp.task('set-output', function() {

	var projSearchPattern = rootDir + '/**/*proj';
	var projExcludePattern = '!' + rootDir +'/**/*.Tests.*proj';

	return gulp
		.src([projSearchPattern, projExcludePattern])
		.pipe(setOutput())
		.pipe(gulp.dest(rootDir));
});

var setOutput = function(){
	return eventStream.map(function(file, callback) {

		var name = path
			.basename(file.path)
			.slice(0, -path.extname(file.path).length);

		var output = path
			.relative(path.dirname(file.path), outputDir);

		output = path.join(output, name);

		var contents = file.contents.toString().replace(
			/<OutputPath>[\s\S]*?<\/OutputPath>/g,
			'<OutputPath>' + output + '</OutputPath>');
		
		file.contents = new Buffer(contents);
		
		callback(null, file);
	});
};

gulp.task('nuget-download', function(callback) {
	if(fs.existsSync('nuget.exe')) {
		return callback();
	}

	require('request')
		.get('http://nuget.org/nuget.exe')
		.pipe(fs.createWriteStream('nuget.exe'))
		.on('finish', function() {
			setTimeout(callback, 500); //HACK: Due to NTFS write specifics
		});
});

var restorePackages = function() {
	return eventStream.map(function(file, callback) {
		return nuget.restore({
			packages: file.path,
			source: [
				'http://devbuildserver/guestAuth/app/nuget/v1/FeedService.svc/',
				'https://www.nuget.org/api/v2/'
			]
		})
		.then(function() { callback(); }, callback);
	});
};

gulp.task('install-packages', ['nuget-download'], function() {
	return gulp
		.src(rootDir + '/**/*.sln')
		.pipe(restorePackages());
});


gulp.task('assemblyInfo', function() {
	var assemblyInfo = require('gulp-dotnet-assembly-info');
	
	return gulp
		.src(rootDir + '/**/AssemblyInfo.cs')
		.pipe(assemblyInfo({
			version: buildVersion,
			fileVersion: buildVersion,
			company: 'Twinfield International N.V.',
			product: 'Twinfield',
			trademark: 'Twinfield',
			copyright: function(value){
				return 'Copyright © Twinfield ' + new Date().getFullYear();
			}
		}))
		.pipe(gulp.dest(rootDir));
});


gulp.task('build', ['clean', 'set-output', 'install-packages', 'assemblyInfo'], function() {

	var msbuild = require('gulp-msbuild');
	return gulp
		.src(rootDir + '/**/*.sln')
		.pipe(msbuild({
			targets: ['Clean', 'Build'],
			errorOnFail: true,
			stdout: true,
			maxcpucount: 4,
			properties: { Configuration: args.configuration }
		}));
});


var setTeamCityParameter = function(name, value) {
	console.log("##teamcity[setParameter name='" + name + "' value='" + value + "']");
};

var pack = function() {

	if(!fs.existsSync(artifactsDir)) {
		fs.mkdirSync(artifactsDir);
	}

	setTeamCityParameter('packageVersion', buildVersion);

	return eventStream.map(function(file, callback) {
		return nuget.pack({
			spec: file.path,
			version: buildVersion,
			basePath: outputDir,
			outputDirectory: artifactsDir,
			noPackageAnalysis: true
		})
		.then(function() { callback(); }, callback); });
};

var processNuspec = function() {
	return gulp
		.src(outputDir + '/**/*.nuspec', { read: false })
		.pipe(pack());
};

gulp.task('package-no-build', processNuspec);

gulp.task('package', ['build'], processNuspec);

gulp.task('default', ['build'], function() {});


gulp.task('test-no-build', function() {
	var nunit = require('gulp-nunit-runner');

	var testSearchPattern = rootDir + '/**/*.Tests.dll';
	var testExcludePattern = '!' + rootDir + '/**/obj/**';

	return gulp
		.src([testSearchPattern , testExcludePattern ], { read: false })
		.pipe(nunit({ 
			executable: rootDir + '/packages/NUnit.Runners.2.6.4/tools/nunit-console.exe',
			teamcity: args.teamcity,
			options: {
				stoponerror: false,
				result: path.join(outputDir, 'TestResult.xml')
			}
		}));
});

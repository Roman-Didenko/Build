var gulp = require('gulp');
var eventStream = require('event-stream');
var nuget = require('nuget-runner')({ nugetPath: 'nuget.exe' });
var fs = require('fs');

var rimraf = require('rimraf');

var rootDir = '../';

gulp.task('clean', function() {
	rimraf.sync(rootDir + 'Output/*');
});

var request = require('request');

gulp.task('nuget-download', function(callback) {
	if(fs.existsSync('nuget.exe')) {
		return callback();
	}

	request
		.get('http://nuget.org/nuget.exe')
		.pipe(fs.createWriteStream('nuget.exe'))
		.on('finish', function() {
			setTimeout(callback, 500); //HACK: Due to NTFS write specifics
		});
});

var restorePackages = function(){
	return eventStream.map(function(file, callback) {
		return nuget.restore({
			packages: file.path,
			source: ['http://devbuildserver/guestAuth/app/nuget/v1/FeedService.svc/','https://www.nuget.org/api/v2/']
		})
		.then(function() { callback(); }, callback);
	});
};

gulp.task('install-packages', ['nuget-download'], function() {
	return gulp
		.src(rootDir + '**/*.sln')
		.pipe(restorePackages());
});

var args = require('yargs').argv;
var assemblyInfo = require('gulp-dotnet-assembly-info');

var buildVersion =  require(rootDir + 'version.json').version + '.' + args.buildNumber;

gulp.task('assemblyInfo', function(){
	return gulp
		.src(rootDir + '**/AssemblyInfo.cs')
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

var msbuild = require('gulp-msbuild');

gulp.task('build', ['clean', 'install-packages', 'assemblyInfo'], function() {
	return gulp
		.src(rootDir + '**/*.sln')
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

var pack = function(destination) {

	if(!fs.existsSync(destination)) {
		fs.mkdirSync(destination);
	}

	setTeamCityParameter('packageVersion', buildVersion);

	return eventStream.map(function(file, callback) {
		return nuget.pack({
			spec: file.path,
			version: buildVersion,
			basePath: rootDir + 'Output',
			outputDirectory: destination,
			noPackageAnalysis: true
		})
		.then(function() { callback(); }, callback); });
};

gulp.task('package-no-build', function(){
	return gulp
		.src(rootDir + 'Output/**/*.nuspec', { read: false })
		.pipe(pack(rootDir + 'Output/Artifacts'));
});

gulp.task('package', ['build'], function(){
	return gulp
		.src(rootDir + 'Output/**/*.nuspec', { read: false })
		.pipe(pack(rootDir + 'Output/Artifacts'))
});

gulp.task('default', ['build'], function(){});

var nunit = require('gulp-nunit-runner');

gulp.task('test-no-build', function(){
	return gulp
		.src(rootDir + '**/bin/**/*Tests.dll', { read: false })
		.pipe(nunit({ 
			executable: rootDir + 'packages/NUnit.Runners.2.6.4/tools/nunit-console.exe',
			teamcity: args.teamcity,
			options: {
				stoponerror: false,
				result: rootDir + 'Output/TestResult.xml'
			}
		}));
});


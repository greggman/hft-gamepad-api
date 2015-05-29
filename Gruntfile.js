"use strict";

var fs      = require('fs');
var semver  = require('semver');
var strings = require('./build/js/strings');

var license = [
'/**                                                                                         ',
' * @license HappyFunTimes %(version)s Copyright (c) 2015, Gregg Tavares All Rights Reserved.',
' * Available via the MIT license.                                                           ',
' * see: http://github.com/greggman/happyfuntimes for details                                ',
' */                                                                                         ',
'/**                                                                                         ',
' * @license almond 0.3.1 Copyright (c) 2011-2014, The Dojo Foundation All Rights Reserved.  ',
' * Available via the MIT or new BSD license.                                                ',
' * see: http://github.com/jrburke/almond for details                                        ',
' */                                                                                         ',
'',
].map(function(s) { return s.replace(/\s+$/, ''); }).join("\n");

// We need to insert the version we expect to ship
// because `bower version patch` will inc the version
// and tag the repo.
var bower = JSON.parse(fs.readFileSync("bower.json", {encoding: "utf8"}));
var bowerInfo = {
  version: semver.inc(bower.version, "patch"),
}
license = strings.replaceParams(license, bowerInfo);

module.exports = function(grunt) {

  grunt.initConfig({
    clean: [
      'src/files.js',
      'dist/happyfuntimes-gamepad-emu.js',
      'dist/happyfuntimes-gamepad-emu-min.js',
    ],
    eslint: {
      src: [
        'src/*.js',
        'controller/scripts/*'
      ],
      options: {
        config: 'build/conf/eslint.json',
        //rulesdir: ['build/rules'],
      },
    },
    requirejs: {
      full: {
        options: {
          baseUrl: "./",
          name: "node_modules/almond/almond.js",
          include: "build/js/includer",
          out: "dist/happyfuntimes-gamepad-emu.js",
          optimize: "none",
          wrap: {
            start: license + fs.readFileSync('build/js/start.js', {encoding: "utf8"}),
            endFile: 'build/js/end.js',
          },
          paths: {
            hftctrl: 'src',
          }
        },
      },
    },
    uglify: {
      min: {
        options: {
          mangle: true,
          //screwIE8: true,
          banner: license,
          compress: true,
        },
        files: {
          'dist/happyfuntimes-gamepad-emu.min.js': ['dist/happyfuntimes-gamepad-emu.js'],
        },
      },
    },
  });

  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-eslint');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-requirejs');

  grunt.registerTask('makeControllerFiles', function() {
    var fs          = require('fs');
    var path        = require('path');
    var readdirtree = require('./build/js/readdirtree');
    var strings     = require('./build/js/strings');

    var excludeRE = /(\.DS_Store|\.bak|Thumbs\.db|ehthumbs\.db|\.DS_Store|\.AppleDouble|\.LSOverride)$/i;
    function exclude(filename) {
      return !excludeRE.test(filename)
    }

    var basePath = 'controller';
    var filenames = readdirtree.sync(basePath, {
      filter: exclude,
    });

    var files = {};
    filenames.forEach(function(name) {
      var filename = path.join(basePath, name);
      var stat = fs.statSync(filename);
      if (stat.isDirectory()) {
        return;
      }
      files[name] = fs.readFileSync(filename, {encoding: "utf8"});
      console.log("read:", name, " len:", files[name].length);
    });

    var template = fs.readFileSync('build/templates/files.template', {encoding: "utf8"});
    fs.writeFileSync('src/files.js', strings.replaceParams(template, {files: JSON.stringify(files, undefined, "  ")}));
  });

  grunt.registerTask('makeindex', function() {
    var marked  = require('marked');
    var fs      = require('fs');
    marked.setOptions({ rawHtml: true });
    var html = marked(fs.readFileSync('README.md', {encoding: 'utf8'}));
    var template = fs.readFileSync('build/templates/index.template', {encoding: 'utf8'});
    var content = strings.replaceParams(template, {
      content: html,
      license: license,
      srcFileName: 'README.md',
      title: 'HappyFunTimes Gamepad API Emulation',
    });
    content = content.replace(/href="http\:\/\/twgljs.org\//g, 'href="/');
    fs.writeFileSync('index.html', content);
  });

  grunt.registerTask('check', ['eslint'])
  grunt.registerTask('default', ['clean', 'check', 'makeControllerFiles', 'requirejs', 'uglify', 'makeindex']);
};


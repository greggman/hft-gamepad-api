"use strict";

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
            startFile: 'build/js/start.js',
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
//          banner: license,
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

  grunt.registerTask('check', ['clean', 'eslint'])
  grunt.registerTask('default', ['check', 'makeControllerFiles', 'requirejs', 'uglify']);
};


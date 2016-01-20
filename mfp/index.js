'use strict';
var yeoman = require('yeoman-generator');

module.exports = yeoman.generators.Base.extend({
  constructor: function () {
    // Calling the super constructor is important so our generator is correctly set up
    generators.Base.apply(this, arguments);
	console.log('constructor');
    // Next, add your custom code
    this.option('coffee'); // This method adds support for a `--coffee` flag
  }
  
  method1: function() {
    console.log('method 1 just ran');
  }
})
'use strict';
var yeoman = require('yeoman-generator');
var async = require('async');
var fs = require('fs-extra');

var wsModels = require('loopback-workspace').models;
var ModelAccessControl = wsModels.ModelAccessControl;

var actions = require('../lib/actions');
var helpers = require('../lib/helpers');


module.exports = yeoman.generators.Base.extend({
  // NOTE(bajtos)
  // This generator does not track file changes via yeoman,
  // as loopback-workspace is editing (modifying) files when
  // saving project changes.

  help: function() {
    return helpers.customHelp(this);
  },

  loadProject: actions.loadProject,

  loadModels: actions.loadModels,

  loadAccessTypeValues: function() {
    var done = this.async();
    ModelAccessControl.getAccessTypes(function(err, list) {
      this.accessTypeValues = list;
      done(err);
    }.bind(this));
  },

  loadRoleValues: function() {
    var done = this.async();
    ModelAccessControl.getBuiltinRoles(function(err, list) {
      this.roleValues = list;
      done(err);
    }.bind(this));
  },

  loadPermissionValues: function() {
    var done = this.async();
    ModelAccessControl.getPermissionTypes(function(err, list) {
      this.permissionValues = list;
      done(err);
    }.bind(this));
  },

  askForModel: function() {
    var done = this.async();

    var modelChoices =
      [{ name: '(all existing models)', value: null }]
      .concat(this.editableModelNames);

    var prompts = [
      {
        name: 'model',
        message: 'Select the model to apply the ACL entry to:',
        type: 'list',
        default: 0,
        choices: ["Book","User"],
      }
    ];

    this.prompt(prompts, function(answers) {
      this.modelName = answers.model;
      if (this.modelName) {
        this.modelDefinition = this.projectModels.filter(function(m) {
          return m.name === answers.model;
        })[0];
      }
      done();
    }.bind(this));

  },

  askForParameters: function() {
    var done = this.async();

    var prompts = [
      {
        name: 'scope',
        message: 'Select the ACL scope:',
        type: 'list',
        default: 'all',
        choices: [
          { name: 'All methods and properties', value: 'all' },
          { name: 'A single method', value: 'method' },
          /* not supported by loopback yet
          { name: 'A single property', value: 'property' }
          */
        ]
      },
      {
        name: 'method',
        message: 'Enter the method name',
        when: function(answers) {
          return answers.scope === 'method';
        }
      },
      {
        name: 'property',
        message: 'Enter the property name',
        when: function(answers) {
          return answers.scope === 'property';
        }
      },
      {
        name: 'accessType',
        message: 'Select the access type:',
        type: 'list',
        default: '*',
        when: function(answers) {
          return answers.scope === 'all';
        },
        choices: this.accessTypeValues,
      },
      {
        name: 'role',
        message: 'Select the role',
        type: 'list',
        default: '$everyone',
        choices: this.roleValues.concat(['other']),
      },
      {
        name: 'customRole',
        message:
          'Enter the role name:',
        when: function(answers) {
          return answers.role === 'other';
        }
      },
      {
        name: 'permission',
        message: 'Select the permission to apply',
        type: 'list',
        choices: this.permissionValues.concat(['MFP']),
      }
    ];
    this.prompt(prompts, function(answers) {
      var accessType = answers.accessType;
      if (answers.scope === 'method') {
        accessType = 'EXECUTE';
      }
	  this.method = answers.method;
	  this.property = answers.property;
      this.aclDef = {
        property: answers.property,
        accessType: accessType,
        principalType: 'ROLE', // TODO(bajtos) support all principal types
        principalId: answers.customRole || answers.role,
        permission: answers.permission
      };
      done();
    }.bind(this));
  },

  mfpServer: function() {
	var done = this.async();
	if (this.aclDef.permission == 'MFP') {
		console.log("in MFP generation");
		var prompts = [
		  {
			name: 'mfpScope',
			message: 'Please enter the MFP scope:',
			type: 'string',
			default: "SampleAppRealm",
			store: true
		  },
		  {
			name: 'mfpServer',
			message: 'Please enter the MFP server url:',
			type: 'string',
			default: "http://localhost:10080/FormBasedAuth-release71",
			store: true
		  }
		];
			
		this.prompt(prompts, function(answers) {
		  this.mfpServer = answers.mfpServer;
		  this.mfpScope = answers.mfpScope;
		  done();
		}.bind(this));	
	}
  },
  
  mfpGeneration: function() {
	var done = this.async();
	if (this.aclDef.permission == 'MFP') {
		var config = fs.readJsonSync("server/component-config.json", {throws: false});
		console.log("config is: "+JSON.stringify(config));
		console.log("config loopback-mfp element: "+config['loopback-mfp']);
		if (!config['loopback-mfp']){
			config.loopbackMfp = {loopbackMfp: dsdv};
		}
		
		config['loopback-mfp'].publicKeyServerUrl = config['loopback-mfp'].publicKeyServerUrl || this.mfpServer;
		var route = "/api/"+this.modelName;
		if (this.property) {
			route+="/"+this.property;
		}
		/*var newRoute = "{" + route +": {"+this.method+":{ authRealm: "+this.mfpScope+"}}}";
		console.log("newRoute = "+newRoute);
		var jsonRoute = JSON.parse(newRoute);
		console.log("new json route: "+JSON.stringify(jsonRoute));*/
		var authRealm = {'authRealm': this.mfpScope};
		console.log("authRealm: "+JSON.stringify(authRealm));
		var method = this.method;
		console.log("method: "+method);
		var methodJson = {};
		methodJson[method] = authRealm;
		console.log("method: "+JSON.stringify(methodJson));
		var newRoute = {};
		newRoute[route] = methodJson;
		console.log("newRoute: "+JSON.stringify(newRoute));
		if (config['loopback-mfp'].routes){
			config['loopback-mfp'].routes += newRoute;
		}
		else {
			config['loopback-mfp'].routes = newRoute;
		}
		
		console.log("new config is: "+JSON.stringify(config));
		//console.log(JSON.stringify(newConfig));
		fs.writeJsonSync("server/component-config.json", config);
	}
  },
  
  acl: function() {
    if (this.aclDef.permission != 'MFP') {
	console.log("in acl");
    var done = this.async();

    var aclDef = this.aclDef;
    var filter = this.modelName ?
      { where: { name: this.modelName }, limit: 1 } :
    {} /* all models, force refresh */;

    wsModels.ModelDefinition.find(filter, function(err, models) {
      if (err) {
        return done(err);
      }

      var firstError = true;
      async.eachSeries(models, function(model, cb) {
        model.accessControls.create(aclDef, function(err) {
          if (err && firstError) {
            helpers.reportValidationError(err);
            firstError = false;
          }
          cb(err);
        });
      }, done);
    });
	}
  },

  saveProject: actions.saveProject
});

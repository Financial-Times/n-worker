'use strict';

require('array.prototype.find');
require('es6-promise').polyfill();
require('isomorphic-fetch');

var flags = require('next-feature-flags-client');
var metrics = require('next-metrics');
var serviceMetrics = require('./lib/service-metrics');
var cron = require('cron');

// Simply needed to patch global errors
require('express-errors-handler');

module.exports.setup = function (options) {
	options = options || {};

	var packageJson = {};

	var defaults = {
		withFlags: false
	};

	Object.keys(defaults).forEach(function (prop) {
		if (typeof options[prop] === 'undefined') {
			options[prop] = defaults[prop];
		}
	});

	var name = options.name;
	var description = "";
	var directory = options.directory || process.cwd();

	if (!name) {
		try {
			packageJson = require(directory + '/package.json');
			name = packageJson.name;
			description = packageJson.description || "";
		} catch(e) {
			// Safely ignorable error
		}
	}

	if (!name) throw new Error("Please specify an application name");

	metrics.init({ app: name, flushEvery: 40000 });
	serviceMetrics.init();

	var flagsPromise = Promise.resolve();

	if (options.withFlags) {
		flagsPromise = flags.init({ url: 'http://ft-next-feature-flags-prod.s3-website-eu-west-1.amazonaws.com/flags/__flags.json' });
	}

	metrics.count('start');

	return flagsPromise;
};

var _cronStart = cron.CronJob.prototype.start;
cron.CronJob.prototype.start = function () {
	metrics.count('cron.start');
	_cronStart.call(this);
};

var _cronStop = cron.CronJob.prototype.stop;
cron.CronJob.prototype.stop = function () {
	metrics.count('cron.stop');
	_cronStop.call(this);
};

module.exports.CronJob = function (opts) {
	var _onTick = opts.onTick;
	var _onComplete = opts.onComplete || function () {};

	return new cron.CronJob({
		cronTime: opts.cronTime,
		start: opts.start === false ? false : true,
		timeZone: opts.timeZone || 'Europe/London',
		context: opts.context || undefined,
		onTick: function() {
			metrics.count('cron.tick');
			_onTick().call(this);
		},
		onComplete: function() {
			_onComplete().call(this);
			metrics.count('cron.success');
		}
	});
};

module.exports.metrics = metrics;
module.exports.flags = flags;

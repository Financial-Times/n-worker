require('isomorphic-fetch');

const flags = require('@financial-times/n-flags-client');
const metrics = require('next-metrics');
const normalizeName = require('./lib/normalize-name');
const serviceMetrics = require('./lib/service-metrics');
const cron = require('cron');

module.exports.setup = function (options) {
	options = options || {};
	const defaults = {
		withFlags: false
	};

	let packageJson = {};

	Object.keys(defaults).forEach(function (prop) {
		if (typeof options[prop] === 'undefined') {
			options[prop] = defaults[prop];
		}
	});

	const directory = options.directory || process.cwd();
	let name = options.name;

	if (!name) {
		try {
			packageJson = require(directory + '/package.json');
			name = packageJson.name;
		} catch(e) {
			// Safely ignorable error
		}
	}

	if (!name) throw new Error('Please specify an application name');
	name = normalizeName(name);

	metrics.init({ app: name, flushEvery: 40000 });
	serviceMetrics.init();

	let flagsPromise = Promise.resolve();

	if (options.withFlags) {
		flagsPromise = flags.init({ url: 'http://ft-next-feature-flags-prod.s3-website-eu-west-1.amazonaws.com/flags/__flags.json' });
	}

	metrics.count('start');

	return flagsPromise;
};

const _cronStart = cron.CronJob.prototype.start;
cron.CronJob.prototype.start = function () {
	metrics.count('cron.start');
	_cronStart.call(this);
};

const _cronStop = cron.CronJob.prototype.stop;
cron.CronJob.prototype.stop = function () {
	metrics.count('cron.stop');
	_cronStop.call(this);
};

module.exports.CronJob = function (opts) {
	const _onTick = opts.onTick;
	const _onComplete = opts.onComplete || function () {};

	return new cron.CronJob({
		cronTime: opts.cronTime,
		start: opts.start === false ? false : true,
		timeZone: opts.timeZone || 'Europe/London',
		context: opts.context || undefined,
		onTick: function () {
			metrics.count('cron.tick');
			_onTick.call(this);
		},
		onComplete: function () {
			_onComplete.call(this);
			metrics.count('cron.success');
		}
	});
};

module.exports.metrics = metrics;
module.exports.flags = flags;

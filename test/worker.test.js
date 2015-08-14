/* global it, describe, beforeEach */
'use strict';

var expect = require('chai').expect;
var worker = require('../index');
var metrics = require('next-metrics');
var sinon = require('sinon');
var flags = require('next-feature-flags-client');
var errorsHandler = require('express-errors-handler');
var cron = require('cron');

describe('n-worker', function () {

	beforeEach(function () {

		GLOBAL.fetch.restore && GLOBAL.fetch.restore();
		// fake metrics has not been initialised
		delete metrics.graphite;
	});

	describe('setup', function () {
		it('by default don\'t set up flags', function (done) {
			var resolveFlags;
			sinon.stub(flags, 'init', function () {
				return new Promise(function (resolve, reject) {
					resolveFlags = resolve;
				});
			});
			var appCode = sinon.spy();
			var worker1 = worker.setup();
			expect(flags.init.called).to.be.false;

			worker1.then(appCode);
			setImmediate(function () {
				expect(appCode.called).to.be.true;
				flags.init.restore();
				done();
			});
		});

		it('allow waiting for flags to be setup', function (done) {
			var resolveFlags;
			sinon.stub(flags, 'init', function () {
				return new Promise(function (resolve, reject) {
					resolveFlags = resolve;
				});
			});
			var appCode = sinon.spy();
			var worker1 = worker.setup({withFlags: true});
			expect(flags.init.called).to.be.true;

			worker1.then(appCode);
			setTimeout(function () {
				expect(appCode.called).to.be.false;
				resolveFlags();
				setImmediate(function () {
					expect(appCode.called).to.be.true;
					flags.init.restore();
					done();
				});
			}, 1000);
		});

	});

	describe('metrics', function () {


		function getJob (conf) {
			conf = conf || {};
			conf.name = 'demo-app';
			return worker.setup(conf);
		}

		it('should initialise metrics', function () {
			sinon.stub(metrics, 'init');
			getJob();
			expect(metrics.init.calledWith({app: 'demo-app', flushEvery: 40000 })).to.be.true;
			metrics.init.restore();
		});

		it('should provide a util to count application starts', function () {
			sinon.stub(metrics, 'count');
			getJob();
			expect(metrics.count.calledWith('start')).to.be.false;
			worker.started();
			expect(metrics.count.calledWith('start')).to.be.true;
			metrics.count.restore();
		});

		it('should instrument fetch for recognised services', function (done) {
			var realFetch = GLOBAL.fetch;

			sinon.stub(errorsHandler, 'captureMessage');
			getJob();

			expect(GLOBAL.fetch).to.not.equal(realFetch);

			Promise.all([
				fetch('http://ft-next-api-user-prefs-v002.herokuapp.com/', {
					timeout: 50
				}).catch(function () {}),
				fetch('http://bertha.ig.ft.com/ghjgjh', {
					timeout: 50
				}).catch(function () {})
			])
				.then(function () {
					expect(errorsHandler.captureMessage.called).to.be.false;
					errorsHandler.captureMessage.restore();
					done();
				});

		});

		it('should notify sentry of unrecognised services', function (done) {

			sinon.stub(errorsHandler, 'captureMessage');
			getJob();

			fetch('http://notallowed.com', {
				timeout: 50
			})
				.catch(function () {})
				.then(function () {
					expect(errorsHandler.captureMessage.called).to.be.true;
					errorsHandler.captureMessage.restore();
					done();
				});
		});

	});

	describe('CronJob', function () {

		it('should set up some defaults', function () {

			sinon.spy(cron, 'CronJob');
			var cronnieBarker = new worker.CronJob({
				cronTime: '0 0 0 0 0 0',
				onTick: function () {},
				onComplete: function () {}
			});
			expect(cron.CronJob.lastCall.args[0].start).to.be.true;
			expect(cron.CronJob.lastCall.args[0].timeZone).to.equal('Europe/London');
			expect(cron.CronJob.lastCall.args[0].context).to.be.undefined;
			cron.CronJob.restore();
			expect(cronnieBarker instanceof cron.CronJob).to.be.true;
		});

		it('defaults should be overridable', function () {

			sinon.spy(cron, 'CronJob');
			var testContext = {};
			new worker.CronJob({
				cronTime: '0 0 0 0 0 0',
				start: false,
				timeZone: 'Addis Ababa',
				context: testContext,
				onTick: function () {},
				onComplete: function () {}
			});
			expect(cron.CronJob.lastCall.args[0].start).to.be.false;
			expect(cron.CronJob.lastCall.args[0].timeZone).to.equal('Addis Ababa');
			expect(cron.CronJob.lastCall.args[0].context).to.equal(testContext);
			cron.CronJob.restore();
		});

		it('should add metrics to internal methods', function () {
			sinon.spy(cron, 'CronJob');
			sinon.stub(metrics, 'count');
			var onTickSpy = sinon.spy();
			var onCompleteSpy = sinon.spy();
			new worker.CronJob({
				cronTime: '0 0 0 0 0 0',
				onTick: onTickSpy,
				onComplete: onCompleteSpy
			});

			var wrappedOnTick = cron.CronJob.lastCall.args[0].onTick;
			var wrappedOnComplete = cron.CronJob.lastCall.args[0].onComplete;

			wrappedOnTick();
			expect(onTickSpy.called).to.be.true;
			expect(metrics.count.calledWith('cron.tick')).to.be.true;

			wrappedOnComplete();
			expect(onCompleteSpy.called).to.be.true;
			expect(metrics.count.calledWith('cron.success')).to.be.true;
			cron.CronJob.restore();
			metrics.count.restore();
		});

		it('should add metrics to public methods', function () {
			sinon.stub(metrics, 'count');
			var cron = new worker.CronJob({
				cronTime: '0 0 0 0 0 0',
				onTick: function () {},
				onComplete: function () {}
			});

			cron.start();
			expect(metrics.count.calledWith('cron.start')).to.be.true;
			cron.stop();
			expect(metrics.count.calledWith('cron.stop')).to.be.true;
			metrics.count.restore();
		});
	});

});

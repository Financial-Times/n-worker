/* global it, describe, beforeEach */
const expect = require('chai').expect;
const worker = require('../index');
const metrics = require('next-metrics');
const sinon = require('sinon');
const flags = require('@financial-times/n-flags-client');
const raven = require('@financial-times/n-raven');
const cron = require('cron');

describe('n-worker', function () {

	beforeEach(function () {

		GLOBAL.fetch.restore && GLOBAL.fetch.restore();
		// fake metrics has not been initialised
		delete metrics.graphite;
	});

	describe('setup', function () {
		it('by default don\'t set up flags', function (done) {
			sinon.stub(flags, 'init', function () {
				return new Promise(function () {});
			});
			const appCode = sinon.spy();
			const worker1 = worker.setup();
			expect(flags.init.called).to.be.false;

			worker1.then(appCode);
			setImmediate(function () {
				expect(appCode.called).to.be.true;
				flags.init.restore();
				done();
			});
		});

		it('allow waiting for flags to be setup', function (done) {
			let resolveFlags;
			sinon.stub(flags, 'init', function () {
				return new Promise(function (resolve) {
					resolveFlags = resolve;
				});
			});
			const appCode = sinon.spy();
			const worker1 = worker.setup({withFlags: true});
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
			expect(metrics.count.calledWith('start')).to.be.false;
			getJob();
			expect(metrics.count.calledWith('start')).to.be.true;
			metrics.count.restore();
		});

		it('should instrument fetch for recognised services', function (done) {
			const realFetch = GLOBAL.fetch;

			sinon.stub(raven, 'captureMessage');
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
					expect(raven.captureMessage.called).to.be.false;
					raven.captureMessage.restore();
					done();
				});

		});

		it('should notify sentry of unrecognised services', function (done) {

			sinon.stub(raven, 'captureMessage');
			getJob();

			fetch('http://notallowed.com', {
				timeout: 50
			})
				.catch(function () {})
				.then(function () {
					expect(raven.captureMessage.called).to.be.true;
					raven.captureMessage.restore();
					done();
				});
		});

	});

	describe('CronJob', function () {

		it('should set up some defaults', function () {

			sinon.spy(cron, 'CronJob');
			const cronnieBarker = new worker.CronJob({
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
			const testContext = {};
			new worker.CronJob({
				cronTime: '0 0 0 0 0 0',
				start: false,
				timeZone: 'Europe/London',
				context: testContext,
				onTick: function () {},
				onComplete: function () {}
			});
			expect(cron.CronJob.lastCall.args[0].start).to.be.false;
			expect(cron.CronJob.lastCall.args[0].timeZone).to.equal('Europe/London');
			expect(cron.CronJob.lastCall.args[0].context).to.equal(testContext);
			cron.CronJob.restore();
		});

		it('should add metrics to internal methods', function () {
			sinon.spy(cron, 'CronJob');
			sinon.stub(metrics, 'count');
			const onTickSpy = sinon.spy();
			const onCompleteSpy = sinon.spy();
			new worker.CronJob({
				cronTime: '0 0 0 0 0 0',
				onTick: onTickSpy,
				onComplete: onCompleteSpy
			});

			const wrappedOnTick = cron.CronJob.lastCall.args[0].onTick;
			const wrappedOnComplete = cron.CronJob.lastCall.args[0].onComplete;

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
			const cron = new worker.CronJob({
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

'use strict';

var mocha = require('mocha');
var expect = require('chai').expect;
var request = require('supertest');
var app = require('../../app');
var async = require('async');
var googleDrive = require('../../controllers/google-drive.js');
var dropbox = require('../../controllers/dropbox.js');
var user = require('../../controllers/user.js');
var email = require('../../controllers/email.js');
var upload = require('../../controllers/upload-files.js');
var db = require('../../models/pg-database.js');
var query = require('../../config.js').query;
var utils = require('../../utils.js');
var WixWidget = utils.WixWidget;
var pg = require('pg');
var fs = require('fs');

var instanceId = 'whatever';
var compId = '12345'

describe('requests', function () {
  it('should be not found', function (done) {
    request(app).get('/adsfasdfa')
      .expect('Content-Type', /json/)
      .expect(404, done);
  });
});

describe('api requests', function () {

  this.timeout(300000);

  describe('widget IDs', function () {
    it('should give invalid instance error', function (done) {
      request(app).get('/api/settings/' + compId)
        .set('x-wix-instance', 'trololo')
        .expect('Content-Type', /json/)
        .expect(401)
        .end(function (err, res){
          if (err) return done(err);
          expect(res.body).to.have.property('error').to.equal('invalid instance');
          expect(res.body).to.have.property('status').to.equal(401);
          done();
        });
    });


    it('should give "not found" error when component ID is empty', function (done) {
      request(app).get('/api/settings/')
        .set('x-wix-instance', instanceId)
        .expect('Content-Type', /json/)
        .expect(404)
        .end(function (err, res){
          if (err) return done(err);
          expect(res.body).to.have.property('error').to.equal('resource not found');
          expect(res.body).to.have.property('status').to.equal(404);
          done();
        });
    });
  });


  describe.skip('widget settings', function () {

    after(function (doneAfter) {
      var deleteSettings = 'DELETE FROM widget_settings WHERE instance_id = $1 AND component_id = $2';
      var values = [instanceId, compId];
      query(deleteSettings, values, function (err) {
        doneAfter();
      });
    });

    it('should get empty settings', function (done) {
      request(app).get('/api/settings/' + compId)
        .set('x-wix-instance', instanceId)
        .expect('Content-Type', /json/)
        .expect(200)
        .end(function (err, res){
          if (err) return done(err);
          expect(res.body).to.have.property('widgetSettings');
          expect(res.body).to.have.property('status').to.equal(200);
          expect(res.body.widgetSettings).to.have.property('provider').to.equal('');
          done();
        });
    });


    it('should give invalid request format error', function (done) {
      request(app).put('/api/settings/' + compId)
        .set('x-wix-instance', instanceId)
        .send({widgetSettings: 'test'})
        .expect('Content-Type', /json/)
        .expect(400)
        .end(function (err, res){
          if (err) return done(err);
          expect(res.body).to.have.property('status').to.equal(400);
          expect(res.body).to.have.property('error').to.equal('invalid request format');
          done();
        });
    });

    it('should give invalid request format error b/c of settings', function (done) {
      request(app).put('/api/settings/' + compId)
        .set('x-wix-instance', instanceId)
        .send({widgetSettings: {settings: 'test'}})
        .expect('Content-Type', /json/)
        .expect(400)
        .end(function (err, res){
          if (err) return done(err);
          expect(res.body).to.have.property('status').to.equal(400);
          expect(res.body).to.have.property('error').to.equal('invalid request format');
          done();
        });
    });

    it('should update settings', function (done) {
      request(app).put('/api/settings/' + compId)
        .set('x-wix-instance', instanceId)
        .send({widgetSettings: {settings: {hello: 'sup'}}})
        .expect('Content-Type', /json/)
        .expect(201)
        .end(function (err, res){
          if (err) return done(err);
          expect(res.body).to.have.property('status').to.equal(201);
          done();
        });
    });

  });

  describe('files upload session', function () {

    var sessionId;

    after(function (doneAfter) {
        var deleteSession = 'DELETE FROM session WHERE session_id = $1'
        var values = [sessionId];
        query(deleteSession, values, function (err) {
          doneAfter();
        });
    });
    it('should get capacity and sessionId', function (done) {
      request(app).get('/api/files/session/' + compId)
        .set('x-wix-instance', instanceId)
        .expect('Content-Type', /json/)
        .expect(200)
        .end(function (err, res){
          if (err) return done(err);
          expect(res.body).to.have.property('status').to.equal(200);
          expect(res.body).to.have.property('sessionId').to.exist;
          expect(res.body).to.have.property('uploadSizeLimit').to.exist;
          sessionId = res.body.sessionId;
          done();
        });
    });
  });

  describe('files upload', function () {
    var fileIds = [];
    var sessionId;
    var tmpPath = './tmp/';

    before(function (beforeDone) {
      request(app).get('/api/files/session/' + compId)
        .set('x-wix-instance', instanceId)
        .end(function (err, res){
          console.log(res.body);
          if (err) return done(err);
          sessionId = res.body.sessionId;
          console.log('sessionId: ', sessionId);
          beforeDone();
        });
    });

    after(function (doneAfter) {
      var deleteFiles = 'DELETE FROM file WHERE session_id = $1 RETURNING temp_name';
      var deleteSession = 'DELETE FROM session WHERE session_id = $1'
      var values = [sessionId];
      query(deleteFiles, values, function (err, files) {
        query(deleteSession, values, function (err) {
          async.each(files, function (file, callback) {
            fs.unlink(tmpPath + file.temp_name, function(err) {
              if (err) {
                return callback(err);
              }
              callback();
            });
          }, function(err){
              if( err ) {
                console.log('A file failed to process');
              }
              doneAfter();
          });
        });
      });
    });

    it('should error asking for sessionId', function (done) {
      request(app).post('/api/files/upload/' + compId)
        .set('x-wix-instance', instanceId)
        .attach('file', 'test/test.jpg')
        .expect('Content-Type', /json/)
        .expect(400)
        .end(function (err, res){
          if (err) return done(err);
          expect(res.body).to.have.property('status').to.equal(400);
          expect(res.body).to.have.property('error').to.equal('invalid session format');
          done();
        });
    });

    it('should upload first file and return fileId', function (done) {
      request(app).post('/api/files/upload/' + compId + '?sessionId=' + sessionId)
        .set('x-wix-instance', instanceId)
        .attach('file', 'test/test.jpg')
        .expect('Content-Type', /json/)
        .expect(201)
        .end(function (err, res){
          console.log(res.body);
          if (err) return done(err);
          expect(res.body).to.have.property('status').to.equal(201);
          expect(res.body).to.have.property('fileId').to.exist;
          fileIds.push(res.body.fileId);
          done();
        });
    });

    it('should upload second file and return fileId', function (done) {
      request(app).post('/api/files/upload/' + compId + '?sessionId=' + sessionId)
        .set('x-wix-instance', instanceId)
        .attach('file', 'test/test.jpg')
        .expect('Content-Type', /json/)
        .expect(201)
        .end(function (err, res){
          console.log(res.body);
          if (err) return done(err);
          expect(res.body).to.have.property('status').to.equal(201);
          expect(res.body).to.have.property('fileId').to.exist;
          fileIds.push(res.body.fileId);
          done();
        });
    });

    it('should upload zipped files to Google and send email', function (done) {
      var resJson = {
        visitorEmail: 'timoha@bugaga.com',
        visitorName: 'Andrey Elenskiy',
        visitorMessage: 'You better f*cking work',
        fileIds: fileIds
      }

      request(app).post('/api/files/send/' + compId + '?sessionId=' + sessionId)
        .set('x-wix-instance', instanceId)
        .send(resJson)
        .expect('Content-Type', /json/)
        .expect(202)
        .end(function (err, res){
          console.log(res.body);
          if (err) return done(err);
          expect(res.body).to.have.property('status').to.equal(202);
          done();
        });
    });
  });

});


describe('Google Drive', function () {
  var accessToken;
  var file;
  var tmpPath = './tmp/';
  var folderId;
  this.timeout(10000);

  before(function (done) {
    var widgetIds = {
      instanceId: instanceId,
      compId: compId
    };
    user.getTokens(widgetIds, function (err, tokens) {
      if (err) {
        console.error('token retrieval error: ', err);
        done(err);
      }
      accessToken = tokens.access_token;
      done();
    });
    file = {
      name: 'test.jpg',
      originalname: 'test.jpg',
      path: tmpPath + 'test.jpg',
      mimetype: 'image/jpeg',
      size: 58104
    };
    db.widget.getSettings(widgetIds, function (err, settings) {
      if (err) {
        console.error('cant get settings');
        return done();
      }
      folderId = settings.serviceSettings.folderId;
    });
  });

  it('should get available capacity from Google', function (done) {
    googleDrive.getAvailableCapacity(accessToken, function (err, capacity) {
      if (err) {
        console.log('capacity error: ', err);
        return done();
      }
      console.log('capacity: ', capacity);
      expect(capacity).to.be.a('number');
      done();
    });
  });

  it('should create folder on Google Drive', function (done) {
    googleDrive.createFolder(accessToken, function (err, result) {
      if (err) {
        console.log('creating folder error: ', err);
        return done();
      }
      console.log('created folder: ', result);
      expect(result).to.be.exist;
      done();
    });
  });

  it('should upload file to Google Drive', function (done) {
    googleDrive.insertFile(file, folderId, accessToken, function (err, result) {
      if (err) {
        console.log('upload error: ', err);
        return done();
      }
      expect(result).to.have.property('alternateLink').to.exist;
      done();
    });
  });
});



describe('Dropbox', function () {
  var accessToken;
  var file;
  var tmpPath = './tmp/';
  this.timeout(300000);

  before(function (done) {
    var widgetIds = {
      instanceId: instanceId,
      compId: 'dropbox'
    };
    user.getTokens(widgetIds, function (err, tokens) {
      if (err) {
        console.error('token retrieval error: ', err);
        return done();
      }
      accessToken = tokens.access_token;
      done();
    });

    file = {
      name: 'test.jpg',
      originalname: 'test.jpg',
      path: tmpPath + 'test.jpg'
    };
  });

  it('should get available capacity from Dropbox', function (done) {
    dropbox.insertFile(accessToken, function (err, capacity) {
      if (err) {
        console.log('capacity error: ', err);
        return done(err);
      }
      console.log('capacity: ', capacity);
      expect(capacity).to.be.a('number');
      done();
    });
  });


  it('should upload file to Dropbox', function (done) {
    dropbox.insertFile(file, accessToken, function (err, result) {
      if (err) {
        console.log('upload error: ', err);
        return done(err);
      }
      expect(result).to.have.property('path').to.exist;
      done();
    });
  });
});


describe('Email', function () {

  function Visitor(name, email, message) {
    this.name = name;
    this.email = email;
    this.message = message;
  }


  it('should send email', function (done) {
    var message = 'Testing email troloo #yolo #swag <3 <3 <3';
    var url = 'http://static.parastorage.com/services/html-landing/hp/ny/images/1920/stage_1/wix_logo.png';
    var visitor = new Visitor('Timoha TROLOLO', 'andrey.elenskiy@gmail.com', message);
    email.send('andreye@wix.com', visitor, url, function (err, res) {
      expect(res).to.exist;
      done();
    });
  });

  it('should send error emails to both user and visitor', function (done) {
    var message = 'Testing email troloo #yolo #swag <3 <3 <3';
    var visitor = new Visitor('Timoha TROLOLO', 'andrey.elenskiy@gmail.com', message);
    email.sendErrors('andreye@wix.com', visitor, function (err, res) {
      expect(res).to.exist;
      done();
    });
  });
});


describe('Zip', function () {
  var files = [];
  var files2 = [];

  this.timeout(10000);

  before(function (done) {
    files.push({
      temp_name: 'test.jpg',
      original_name: 'test.jpg'
    });

    files.push({
      temp_name: 'rendering.png',
      original_name: 'rendering.png'
    });

    files2.push({
      temp_name: 'test.jpg',
      original_name: 'test.jpg'
    });

    files2.push({
      temp_name: 'rendering.png',
      original_name: 'rendering.png'
    });

    files2.push({
      temp_name: 'engineer.jpg',
      original_name: 'engineer.jpg'
    });
    done();
  });

  it('should zip the first files array', function (done) {
    upload.zipAndRecord(files, 'hello', function (err, file) {
      expect(err).to.not.exist;
      expect(file).to.have.property('name').to.exist;
      expect(file).to.have.property('path').to.exist;
      expect(file).to.have.property('mimetype').to.equal('application/zip');
      expect(file).to.have.property('size').to.be.a('number');
      expect(file).to.have.property('originalname').to.equal('hello.zip');
      expect(file).to.have.property('fileId').to.be.a('number');
      expect(fs.existsSync(file.path)).to.be.true;
      done();
    });
  });

  it('should zip the second files array', function (done) {
    upload.zipAndRecord(files2, 'hello2', function (err, file) {
      expect(err).to.not.exist;
      expect(file).to.have.property('name').to.exist;
      expect(file).to.have.property('path').to.exist;
      expect(file).to.have.property('mimetype').to.equal('application/zip');
      expect(file).to.have.property('size').to.be.a('number');
      expect(file).to.have.property('originalname').to.equal('hello2.zip');
      expect(file).to.have.property('fileId').to.be.a('number');
      expect(fs.existsSync(file.path)).to.be.true;
      done();
    });
  });
});


describe.only('Utils', function () {
  describe('encryption', function () {
    var fakeString = 'yolo';
    var encryptedIds;
    var widgetIds = new WixWidget(instanceId, compId);
    before(function (done) {
      encryptedIds = utils.encrypt(JSON.stringify(widgetIds));
      done();
    });
    it('should produce giberrish on decryption', function (done) {
      var decryptedString = utils.decrypt(fakeString);
      console.log('decryptedString: ', decryptedString);
      expect(decryptedString).to.not.exist;
      done();
    });
    it('should decrypt encrypted widgetIds', function (done) {
      var decryptedIds = JSON.parse(utils.decrypt(encryptedIds));
      console.log('decryptedString: ', decryptedIds);
      expect(decryptedIds).to.have.property('instanceId').to.equal(instanceId);
      expect(decryptedIds).to.have.property('compId').to.equal(compId);
      done();
    });
  });
});







// Description:
//   hubot-mongodb-brain
//   support MongoLab and MongoHQ on heroku.
//
// Dependencies:
//   "mongodb": "*"
//   "lodash" : "*"
//
// Configuration:
//   MONGODB_URL or MONGOLAB_URI or MONGOHQ_URL or 'mongodb://localhost:27017/hubot'
//
// Author:
//   Sho Hashimoto <hashimoto@shokai.org>
//   mohemohe

//@ts-check

const { MongoClient } = require('mongodb');
const Url = require('url');

class MongoDB {
  constructor(robot) {
    this.robot = robot;

    this.url = process.env.MONGODB_URL ||
      process.env.MONGOLAB_URI ||
      process.env.MONGOHQ_URL ||
      'mongodb://localhost:27017/hubot';

    const urlInfo = Url.parse(this.url);
    this.dbName = urlInfo.pathname ? urlInfo.pathname.replace('/', '') : 'hubot';
  }

  async _connect() {
    this.client = await MongoClient.connect(this.url, {
      useNewUrlParser: true,
    });
    this.db = this.client.db(this.dbName);
    try {
      this.db.createCollection('brain');
    } catch (e) {}
    this.collection = this.db.collection('brain');
    this.robot.logger.info('MongoDB connected');
  }

  async load() {
    await this._connect();

    this.robot.brain.setAutoSave(false);

    this.collection.find().toArray((err, docs) => {
      if (err) {
        throw err;
      }
      this.robot.brain.mergeData({
        _private: docs.reduce((obj, doc) => {
          obj[doc.key] = doc.value;
          return obj;
        }, {}),
      });
      this.robot.logger.info('MongoDB loaded');

      this.robot.brain.setAutoSave(true);
    });
  }

  async save(data) {
    this.robot.brain.setAutoSave(false);

    const bulk = this.collection.initializeUnorderedBulkOp();
    Object.keys(data._private).forEach((key) => {
      bulk.find({key}).upsert().updateOne({
        key,
        value: data._private[key],
      });
    });
    await bulk.execute();

    this.robot.brain.setAutoSave(true);
  }

  close() {
    this.client.close();
  }
}

module.exports = (robot) => {
  const mongodb = new MongoDB(robot);
  robot.brain.on('close', () => mongodb.close());
  robot.brain.on('save', data => mongodb.save(data));

  mongodb.load();
};

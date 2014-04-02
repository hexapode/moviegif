var path = require('path'),
    rootPath = path.normalize(__dirname + '/..'),
    env = process.env.NODE_ENV || 'development';

var config = {
  development: {
    root: rootPath,
    app: {
      name: 'moviegif'
    },
    port: 3002,
    db: 'mongodb://localhost/moviegif-development'
  },

  test: {
    root: rootPath,
    app: {
      name: 'moviegif'
    },
    port: 3002,
    db: 'mongodb://localhost/moviegif-test'
  },

  production: {
    root: rootPath,
    app: {
      name: 'moviegif'
    },
    port: 80,
    db: 'mongodb://localhost/moviegif-production'
  }
};

module.exports = config[env];

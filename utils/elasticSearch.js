var elasticsearch = require('elasticsearch');
var client = new elasticsearch.Client({
    host: 'localhost:9200',
    log: 'trace'
});

client.ping({
    requestTimeout: 1000,
  // undocumented params are appended to the query string
    hello: "elasticsearch!"
}, function (err) {
    if (err) {
	return console.error('elasticsearch cluster is down!');
    }

    console.log('All is well');
});

client.create({
  index: 'test',
  type: 'mytype',
  id: '2',
  body: {
    title: 'Test 2',
    tags: ['y', 'w'],
    published: true,
    published_at: '2013-01-02',
    counter: 1
  }
}, function (err, response) {
  if (err) {
      client.search({
	  index: 'test',
	  q: 'Test'
      }, function (err, response) {
	  if (err) {
	      return console.error(err);
	  }

	  console.log(response.hits.hits);
      });
      
  }
});

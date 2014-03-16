var elasticsearch = require('elasticsearch');
var client = new elasticsearch.Client({
    host: 'localhost:9200',
    log: 'trace'
});

exports.index = function(req, res){
  client.search({
    index: 'srt',
    q: req.query.q || '*'
  }, function(err, results){

    if (err) {
      res.render('search/error', { title: 'Search results',
      query: req.query.q || '*'});
    }

    res.render('search/index', {
      title: 'Search results',
      query: req.query.q || '*',
      results: results.hits.hits.map(function (result) {
        return result._source;
      })
    });
  });
};
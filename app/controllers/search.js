var elasticsearch = require('elasticsearch');
var client = new elasticsearch.Client({
    host: 'localhost:9200',
    log: 'trace'
});

exports.index = function(req, res) {
    client.search({
	index: 'srt',
	body: {
	    query: {
		match: {
		    srt: req.query.q || '*'
		}
	    },
	    size: 100
	}
    }, function(err, results){

	if (err) {
	    return res.render('search/error', { title: 'Search results',
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
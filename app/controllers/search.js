var elasticsearch = require('elasticsearch');
var client = new elasticsearch.Client({
    host: 'localhost:9200',
    log: 'trace'
});

exports.index = function(req, res) {
    var query = req.query.q || '*';

    var params = {
	index: 'srt'
    };

    if (query !== '*') {
	params.body = {
	    query: {
		match: {
		    srt: req.query.q
		}
	    },
	    size: 100
	};
    } else {
	params.q = '*';
    }

    client.search(params, function(err, results){
	if (err) {
	    return res.render('search/error', {
		title: 'Search results',
		query: query
	    });
	}

	res.render('search/index', {
	    title: 'Search results',
	    query: query,
	    results: results.hits.hits.map(function (result) {
		return result._source;
	    })
	});
    });
};
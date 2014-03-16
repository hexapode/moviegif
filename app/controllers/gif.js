var elasticsearch = require('elasticsearch');
var client = new elasticsearch.Client({
    host: 'localhost:9200',
    log: 'trace'
});

exports.index = function(req, res) {
    var id = req.params.id;

    client.search({
	index: 'srt',
	type: 'srt',
	id: id
    }, function(err, results){
	if (err) throw new Error(err);

	res.render('gif/index', {
	    title: 'Gif: ' + id,
	    gif: id
	});
    });
};
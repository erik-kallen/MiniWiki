exports.getWiki = function(req, res){
  res.send(req.params.path);
};
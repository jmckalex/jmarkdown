.PHONY: start ph226

start:
	node ./src/index.js jmarkdown.md
	fswatch -0 jmarkdown.md | xargs -0 -n 1 node ./src/index.js & 
	browser-sync start --server --files jmarkdown.html test.css --followSymlinks true --startPath jmarkdown.html --browser "Google Chrome" &> /dev/null &

ph226:
	node ./src/index.js ph226-moderation.md
	fswatch -0 ph226-moderation.md | xargs -0 -n 1 node ./src/index.js ph226-moderation.md & 
	browser-sync start --server --files ph226-moderation.html test.css --startPath ph226-moderation.html --browser "Google Chrome" &> /dev/null &
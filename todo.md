---

# /JMarkdown/ to do

- [ ] Fix the way require() works in jmarkdown script tags.  
    It should load any code in the node_modules directory of the current
    jmarkdown file or the global node_modules. 
    Priority: medium

- [ ] Add TiKZ support.
    This should appear in fenced code blocks.  When processed, the TiKZ code should be
    processed as follows:
    1. All TiKZ code should be extracted and saved in a TiKZ/ directory, with
        each graphic saved to a separate file.  (Although it is faster to generate the SVG if it
        is all saved into a single file, that makes it harder to detect whether any graphics
        need to be regenerated.)
    2. Use a saved hash code to detect which graphics need to be regenerated.
    3. Use the luaLaTeX -> DVI -> SVG route to generate the TiKZ graphics as SVG with all
        fonts converted to paths.
    4. Replace the fenced code block with the corresponding SVG graphic.
    Priority: medium (this would be nice to have, but not essential)

- [ ] Add Mermaid support.
    I don't use it that much, but it would be nice to support this out of the box.
    Priority: Low

- [ ] Add D3 support.
    This would be useful for including graphs or various data representations.
    I'm not sure if this is possible, though, as D3 needs to access a DOM... I may
    need to see if JSDOM provides the kind of DOM which D3 can access / manipulate.
    Priority: Low (this is harder than it looks)

- [ ] Refactor the codebase to clean it up
    - [ ] Description list in a separate file
    - [ ] Custom extensions (defined in metadata header) to separate file
    - [ ] inline-script defined functions to separate file
    Priority: High (the code base is getting too messy to maintain)


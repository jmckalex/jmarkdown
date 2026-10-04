# Two

@begin(figure)[Second figure]{id=fig:b}
![b](f.png)
@end(figure)

@begin(figure)[Third figure]{id=fig:c}
![c](f.png)
@end(figure)

@begin(lemma)[Second]{id=thm:b}
A lemma.
@end(lemma)

@begin(equation){id=eq:b}
y = 2
@end(equation)

See @ref[fig:a], @cref[fig:c], @cref[thm:b] and @ref[eq:b].

@begin(listing)[A listing]{id=lst:a}
```python
print(1)
```
@end(listing)

<script data-type="jmarkdown">
defineEnvironment('exercise', { numbered: true, html: (ctx) => `<div class="exercise">${ctx.inner}</div>` });
</script>

@begin(exercise){id=ex:a}
Do it.
@end(exercise)

See @ref[lst:a] and @ref[ex:a].

import re
p = r"C:/Users/HP/onedrive/desktop/maya/app-maya/components/PlanHeader.tsx"
with open(p, 'r', encoding='utf-8') as f:
    t = f.read()

O = chr(123)  # {
C = chr(125)  # }
Q = chr(39)   # '

fixes = []

fixes.append(('line-clamp-3">' + O + 'prompt' + C, 'line-clamp-3">' + O + 'prompt' + C))  # noop safe

# Fix tag patterns with truncated } — render as raw strings to bypass any shell templating
def rep(needle, replacement):
    if needle in t:
        t_new = t.replace(needle, replacement)
        print('replaced:', needle[:60])
        return t_new
    return t

t = rep('line-clamp-3">' + O + 'prompt',
        'line-clamp-3">' + O + 'prompt' + C +</span>')
t = rep('line-clamp-2">' + O + Q + 'plan.description',
        'line-clamp-2">' + O + 'plan.description' + C +</p>')
t = rep('line-clamp-1">' + O + 'f',
        'line-clamp-1">' + O + 'f' + C +</span>')
t = rep('tracking-wider">' + O + Q + 'label' + Q,
        'tracking-wider">' + O + Q + 'label' + Q + C +</span>')
t = rep('mt-0.5">' + O + Q + chr(183) + Q,
        'mt-0.5">' + O + Q + chr(183) + Q + C +</span>')
t = rep('tracking-normal">' + O + Q + chr(183) + ' ' + 'hint',
        'tracking-normal">' + O + Q + chr(183) + ' ' + 'hint' + Q + C +</span>')

with open(p, 'w', encoding='utf-8') as f:
    f.write(t)
print('saved')

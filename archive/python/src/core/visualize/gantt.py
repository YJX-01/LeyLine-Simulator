import random
from math import ceil
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors

action_match = {
    0: 'A',
    1: 'E',
    2: 'Q'
}

color_raw = {
    'ANEMO': [
        mcolors.LinearSegmentedColormap.from_list(
            'anemo1', [(0, '#93f9b9'), (1, '#1d976c')], N=32),
        mcolors.LinearSegmentedColormap.from_list(
            'anemo2', [(0, '#DFFFCD'), (0.48, '#90F9C4'), (1, '#39F3BB')], N=32),
        mcolors.LinearSegmentedColormap.from_list(
            'anemo3', [(0, '#8ddad5'), (1, '#00cdac')], N=32),
        mcolors.LinearSegmentedColormap.from_list(
            'anemo4', [(0, '#38f9d7'), (1, '#43e97b')], N=32)
    ],
    'GEO': [
        mcolors.LinearSegmentedColormap.from_list(
            'geo1', [(0, '#f6d365'), (1, '#fda085')], N=32),
        mcolors.LinearSegmentedColormap.from_list(
            'geo2', [(0, '#FFF800'), (1, '#f9d423')], N=32),
        mcolors.LinearSegmentedColormap.from_list(
            'geo3', [(0, '#ffd452'), (1, '#f7b733')], N=32),
        mcolors.LinearSegmentedColormap.from_list(
            'geo4', [(0, '#edde5d'), (1, '#f09819')], N=32)
    ],
    'ELECTRO': [
        mcolors.LinearSegmentedColormap.from_list(
            'electro1', [(0, '#a044ff'), (1, '#6a3093')], N=32),
        mcolors.LinearSegmentedColormap.from_list(
            'electro2', [(0, '#FF057C'), (0.5, '#8D0B93'), (1, '#321575')], N=32),
        mcolors.LinearSegmentedColormap.from_list(
            'electro3', [(0, '#cc208e'), (1, '#6713d2')], N=32),
        mcolors.LinearSegmentedColormap.from_list(
            'electro4', [(0, '#aa076b'), (1, '#61045f')], N=32),
    ],
    'DENDRO': [
    ],
    'HYDRO': [
        mcolors.LinearSegmentedColormap.from_list(
            'hydro1', [(0, '#3498db'), (1, '#4b6cb7')], N=32),
        mcolors.LinearSegmentedColormap.from_list(
            'hydro2', [(0, '#0acffe'), (1, '#495aff')], N=32),
        mcolors.LinearSegmentedColormap.from_list(
            'hydro3', [(0, '#04befe'), (1, '#4481eb')], N=32),
        mcolors.LinearSegmentedColormap.from_list(
            'hydro4', [(0, '#8f94fb'), (1, '#4e54c8')], N=32),
    ],
    'PYRO': [
        mcolors.LinearSegmentedColormap.from_list(
            'pyro1', [(0, '#ed213a'), (1, '#93291e')], N=32),
        mcolors.LinearSegmentedColormap.from_list(
            'pyro2', [(0, '#ff416c'), (1, '#ff4b2b')], N=32),
        mcolors.LinearSegmentedColormap.from_list(
            'pyro3', [(0, '#ef473a'), (1, '#cb2d3e')], N=32),
        mcolors.LinearSegmentedColormap.from_list(
            'pyro4', [(0, '#ffb199'), (1, '#ff0844')], N=32),
    ],
    'CRYO': [
        mcolors.LinearSegmentedColormap.from_list(
            'cryo1', [(0, '#e2e2e2'), (1, '#c9d6ff')], N=32),
        mcolors.LinearSegmentedColormap.from_list(
            'cryo2', [(0, '#f3e7e9'), (1, '#e3eeff')], N=32),
        mcolors.LinearSegmentedColormap.from_list(
            'cryo3', [(0, '#ece9e6'), (1, '#FFE6FA')], N=32),
        mcolors.LinearSegmentedColormap.from_list(
            'cryo4', [(0, '#e7f0fd'), (1, '#accbee')], N=32),
    ],
}

character_trans = {
    'Ayaka': 'CRYO',
    'Jean': 'ANEMO',
    'Lisa': 'ELECTRO',
    'Traveler': 'ANEMO',
    'Barbara': 'HYDRO',
    'Kaeya': 'CRYO',
    'Diluc': 'PYRO',
    'Razor': 'ELECTRO',
    'Amber': 'PYRO',
    'Venti': 'ANEMO',
    'Xiangling': 'PYRO',
    'Beidou': 'ELECTRO',
    'Xingqiu': 'HYDRO',
    'Xiao': 'ANEMO',
    'Ningguang': 'GEO',
    'Klee': 'PYRO',
    'Zhongli': 'GEO',
    'Fischl': 'ELECTRO',
    'Bennett': 'PYRO',
    'Tartaglia': 'HYDRO',
    'Noelle': 'GEO',
    'Qiqi': 'CRYO',
    'Chongyun': 'CRYO',
    'Ganyu': 'CRYO',
    'Albedo': 'GEO',
    'Diona': 'CRYO',
    'Mona': 'HYDRO',
    'Keqing': 'ELECTRO',
    'Sucrose': 'ANEMO',
    'Xinyan': 'PYRO',
    'Rosaria': 'CRYO',
    'Hutao': 'PYRO',
    'Kazuha': 'ANEMO',
    'Yanfei': 'PYRO',
    'Yoimiya': 'PYRO',
    'Thoma': 'PYRO',
    'Eula': 'CRYO',
    'Shogun': 'ELECTRO',
    'Sayu': 'ANEMO',
    'Kokomi': 'HYDRO',
    'Gorou': 'GEO',
    'Sara': 'ELECTRO',
    'Itto': 'GEO',
    'Aloy': 'CRYO',
    'Shenhe': 'CRYO',
    'Yunjin': 'GEO',
}

name_match = random.choices(list(character_trans.keys()), k=4)


def act(t):
    s, b, d, a = t
    return {
        'source': s,
        'begin': b,
        'duration': d,
        'action': a
    }


data_raw = [
    (0, 0, 5, 2),
    (0, 2, 5, 1),
    (1, 3, 1, 1),
    (1, 4, 8, 2),
    (2, 5, 5, 1),
    (2, 6, 10, 2),
    (0, 8, 0.5, 0),
    (0, 10, 0.5, 0),
    (0, 12, 0.5, 0),
    (0, 14, 0.5, 0),
    (3, 16, 1, 1),
    (3, 17, 1, 2),
    (3, 18, 1, 0)
]
data = list(sorted(data_raw, key=lambda x: x[1]))
on_list = []
pre = data[0][0]
pre_t = data[0][1]
for i, d in enumerate(data):
    if d[0] != pre:
        on_list.append((pre, pre_t, d[1]-pre_t))
        pre = d[0]
        pre_t = d[1]
on_list.append((pre, pre_t, data[-1][1]+data[-1][2]-pre_t))


data = [act(t) for t in data]

color_match = []
elem_cnt = []
y_list = ['On Stage']
for i_, c in enumerate(name_match):
    i = elem_cnt.count(character_trans[c])
    color_match.append(color_raw[character_trans[c]][i])
    elem_cnt.append(character_trans[c])
    a_flag, e_flag, q_flag = False, False, False
    for d in data_raw:
        if d[0] == i_:
            if d[3] == 0 and not a_flag:
                a_flag = True
                y_list.append(c+'.A')
            if d[3] == 1 and not e_flag:
                e_flag = True
                y_list.append(c+'.E')
            if d[3] == 2 and not q_flag:
                q_flag = True
                y_list.append(c+'.Q')

y_list = list(reversed(y_list))


def get_action_name(s, a):
    return '{}.{}'.format(name_match[s], action_match[a])


fig, ax = plt.subplots(figsize=(9, 5))

ax.barh(y_list,
        [0 for i in range(len(y_list))],
        left=[0 for i in range(len(y_list))],
        height=0.5, color='none')

label_list = []
legend_list = []
low, high = 20, 0

for d in on_list:
    rect = ax.barh('On Stage',
                   d[2],
                   left=d[1],
                   height=0.5,
                   label=name_match[d[0]],
                   color=color_match[d[0]](0.9),
                   edgecolor='black')
    r, g, b = mcolors.to_rgb(color_match[d[0]](0.9))
    text_color = 'white' if r * g * b < 0.5 else 'darkgrey'
    ax.bar_label(rect, labels=[name_match[d[0]]],
                 label_type='center', color=text_color)

for d in data:
    rect = ax.barh(get_action_name(d['source'], d['action']),
                   d['duration'],
                   left=d['begin'],
                   height=0.5,
                   label=get_action_name(d['source'], d['action']),
                   color=color_match[d['source']](d['action']/4),
                   edgecolor='black')
    low = int(min(low, d['begin']))
    high = ceil(max(high, d['begin']+d['duration']))
    l = rect.get_label()
    if l not in label_list:
        label_list.append(l)
        legend_list.append(rect)
    r, g, b = mcolors.to_rgb(color_match[d['source']](d['action']/4))
    text_color = 'white' if r * g * b < 0.5 else 'darkgrey'
    ax.bar_label(rect, labels=[action_match[d['action']]],
                 label_type='center', color=text_color)

ax.set_xlim(low, high)
ax.legend(handles=legend_list, labels=label_list, ncol=4, bbox_to_anchor=(0, 1),
          loc='lower left', fontsize='small')

ax.set_axisbelow(True)
ax.xaxis.grid(color='k', linestyle='--', alpha=0.5, which='both')


def proper_separation(low, high):
    i = high - low
    if i <= 10:
        return np.linspace(low, high, 5*i+1), np.linspace(low, high, 5*i+1)[::5]
    else:
        return np.linspace(low, high, 2*i+1), np.linspace(low, high, 2*i+1)[::2]


xt_minor, xt = proper_separation(low, high)

ax.set_xticks(xt)
ax.set_xticks(xt_minor, minor=True)

plt.show()

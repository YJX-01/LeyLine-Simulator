from math import ceil
from typing import TYPE_CHECKING, List
from core.visualize.genshin_color import ColorManager
import numpy as np
import matplotlib.pyplot as plt
if TYPE_CHECKING:
    from core.entities.numeric import NumericController
    from core.simulation.simulation import Simulation


class LogPrinter(object):
    def __init__(self, controller: 'NumericController'):
        self.controller = controller
        self.cm = None

    def paint_color(self, simulation: 'Simulation'):
        self.cm = ColorManager(simulation)

    def print_char_log(self, name: str, interest: List[str]):
        lines = []
        for k in interest:
            line = np.array(self.controller.char_attr_log[name][k])
            while (line.max() >= 5):
                line /= 10
            lines.append(line)

        fig, ax = plt.subplots()
        for i, k in enumerate(interest):
            ax.plot(np.arange(0, len(lines[i])/10, 0.1), lines[i], label=k)
        ax.legend()
        plt.xlim(left=0)
        plt.ylim(0, 5)
        plt.yticks(np.linspace(0, 5, 26))
        plt.ylabel('Value')
        plt.xlabel('time / s')
        plt.title(f'{name} Attribute Log')
        plt.grid(True, 'both', alpha=0.7)
        plt.tight_layout()
        plt.show()

    def print_energy_log(self):
        lines = []
        labels = []
        max_x = 0
        for k in self.controller.energy_log:
            line = np.array(self.controller.energy_log[k])
            lines.append(line)
            labels.append(k)

        fig, ax = plt.subplots()
        for i, k in enumerate(labels):
            if self.cm:
                ax.plot(np.arange(0, len(lines[i])/10, 0.1), lines[i], label=k,
                        color=self.cm.get_char_color(k))
            else:
                ax.plot(np.arange(0, len(lines[i])/10, 0.1), lines[i], label=k)
            max_x = max(max_x, len(lines[i])/10)
        ax.legend()
        plt.xlim(0, ceil(max_x))
        plt.ylim(0, 100)
        plt.yticks(np.linspace(0, 100, 11))
        plt.ylabel('Energy')
        plt.xlabel('time / s')
        plt.title('Energy Log')
        plt.grid(True, 'both', alpha=0.7)
        plt.tight_layout()
        plt.show()

    def print_damage_log(self, names: List[str]):
        times = []
        damages = []
        for name in names:
            line = []
            for k, v in self.controller.dmg_log[name].items():
                line.extend(v)
            line.sort(key=lambda x: x[0])
            x, y = zip(*line)
            times.append(np.array(x))
            damages.append(np.array(y))

        fig, ax = plt.subplots()
        for i, k in enumerate(names):
            if self.cm:
                ax.plot(times[i], damages[i], label=k, marker='o',
                        color=self.cm.get_char_color(k))
            else:
                ax.plot(times[i], damages[i], label=k, marker='o')
        ax.legend()
        plt.ylim(bottom=0)
        plt.xlim(left=0)
        plt.ylabel('Damage')
        plt.xlabel('time / s')
        plt.title('Damage Log')
        plt.grid(True, 'both', alpha=0.7)
        plt.tight_layout()
        plt.show()

    def print_damage_pie(self, names: List[str] = []):
        if not names:
            names = list(self.controller.dmg_log.keys())
        types = {}
        for character in names:
            types[character] = {}
            for k, v in self.controller.dmg_log[character].items():
                type_sum = sum([x[1] for x in v])
                if type_sum > 0:
                    types[character][k] = type_sum
        outer_val = [sum(n.values()) for n in types.values()]
        inner_val = [d for n in types.values() for d in n.values()]
        inner_name = [k+'.'+ty.lower()
                      for k, n in types.items()
                      for ty in n.keys()]

        if self.cm:
            outer_colors = [self.cm.get_char_color(n) for n in types.keys()]
            inner_colors = [self.cm.get_skill_color((k, ty))
                            for k, n in types.items() for ty in n.keys()]
        else:
            cm = plt.colormaps['rainbow']
            num_chars = len(types)
            outer_colors = cm(np.linspace(0, 1, num_chars))
            inner_colors = []
            for i, n in enumerate(types.values()):
                num_type = len(n)
                sep = np.linspace(i/num_chars,
                                  (i+1)/num_chars,
                                  num_type+1)[1:-1]
                inner_colors.extend(cm(sep))

        def func(pct, val):
            absolute = int(np.round(pct/100.*np.sum(val)))
            return "{:.1f}%\n({:d})".format(pct, absolute)

        fig, ax = plt.subplots(figsize=(10, 10))
        size = 0.3
        wedges, texts, autotexts = \
            ax.pie(outer_val, radius=1, colors=outer_colors,
                   autopct=lambda pct: func(pct, inner_val),
                   pctdistance=0.8,
                   wedgeprops=dict(width=size, edgecolor='w'),
                   textprops=dict(color="w"))

        wedges2, texts2, autotexts2 = \
            ax.pie(inner_val, radius=1-size, colors=inner_colors,
                   autopct=lambda pct: func(pct, inner_val),
                   pctdistance=0.8,
                   wedgeprops=dict(width=size, edgecolor='w'),
                   textprops=dict(color="w"))

        ax.legend(wedges2, inner_name)
        ax.set(aspect="equal", title='Damage pie plot')
        plt.setp(autotexts+autotexts2, size=8, weight="bold")
        plt.show()

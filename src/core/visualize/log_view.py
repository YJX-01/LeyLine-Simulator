from math import ceil
from typing import TYPE_CHECKING, List, Tuple
from core.visualize.genshin_color import ColorManager
import numpy as np
import matplotlib.pyplot as plt
if TYPE_CHECKING:
    from core.entities.numeric import NumericController
    from core.simulation.simulation import Simulation


class LogPrinter(object):
    def __init__(self, controller: 'NumericController'):
        '''
        input a NumericController to initialize\n
        use paint_color(Simulation) if you want to customize colors
        '''
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

    def print_damage_one(self, name: str, interval: float = 1):
        markers = dict(
            NONE='H',
            NORMAL_ATK='^',
            CHARGED_ATK='<',
            PLUNGING_ATK='>',
            ELEM_SKILL='o',
            ELEM_BURST='s',
        )
        start, end = 0, 0
        dmg_sum = [0]*500

        fig, ax = plt.subplots()

        for k, v in self.controller.dmg_log[name].items():
            line: List[Tuple[float, float]] = list(v)
            if not line:
                continue
            for t, d in line:
                dmg_sum[int(t/interval)] += (d/interval)
            x, y = zip(*line)
            times = np.array(x)
            damages = np.array(y)
            end = max(end, times[-1])
            start = min(start, times[0])
            color = self.cm.get_skill_color(
                (name, k)) if self.cm else 'deepskyblue'

            markerline, stemlines, baseline = ax.stem(
                times, damages, label=name+'.'+k.lower())
            markerline.set(color=color, marker=markers[k],
                           markersize=9, markeredgecolor='w',
                           markeredgewidth=1)
            stemlines.set(color=color, alpha=0.5, linewidth=2)
            baseline.set(color='w')

        start = int(start)
        end = ceil(end+1)
        color = self.cm.get_char_color(name) if self.cm else 'cyan'
        ax.bar(np.arange(0, 500*interval, interval),
               dmg_sum, width=[interval]*500,
               align='edge', alpha=0.5, color=color)

        plt.legend()
        plt.ylim(bottom=0)
        plt.xlim(start, end)
        plt.ylabel('Damage')
        plt.xlabel('time / s')
        plt.title(f'Damage Log for {name}')
        plt.grid(True, 'both', alpha=0.7)
        plt.tight_layout()
        plt.show()

    def print_damage_stack(self):
        end = 0
        sum_by_char = dict.fromkeys(self.controller.dmg_log.keys())
        for name in self.controller.dmg_log:
            dmg_sum = np.zeros(2000)
            for v in self.controller.dmg_log[name].values():
                line: List[Tuple[float, float]] = list(v)
                if not line:
                    continue
                for t, d in line:
                    dmg_sum[int(10*t)] += d
                    end = max(end, int(t))
            sum_by_char[name] = np.add.accumulate(dmg_sum)
        end = ceil(end)
        if self.cm:
            colors = [self.cm.get_char_color(n) for n in sum_by_char.keys()]
            plt.stackplot(np.arange(0, 200, 0.1),
                          sum_by_char.values(),
                          labels=sum_by_char.keys(),
                          alpha=0.7,
                          colors=colors)
        else:
            plt.stackplot(np.arange(0, 200, 0.1),
                          sum_by_char.values(),
                          labels=sum_by_char.keys(),
                          alpha=0.7)
        plt.legend()
        plt.ylim(bottom=0)
        plt.xlim(0, end)
        plt.ylabel('Damage')
        plt.xlabel('time / s')
        plt.title('Damage stackplot')
        plt.grid(True, 'both', alpha=0.7)
        plt.tight_layout()
        plt.show()

    def print_damage_stackbar(self, interval: float = 1):
        end = 0
        bottom_sum = np.zeros(500)
        for name in self.controller.dmg_log.keys():
            dmg_sum = np.zeros(500)
            for v in self.controller.dmg_log[name].values():
                line: List[Tuple[float, float]] = list(v)
                if not line:
                    continue
                for t, d in line:
                    dmg_sum[int(t/interval)] += (d/interval)
                    end = max(end, t)
            end = ceil(end+1)
            if self.cm:
                color = self.cm.get_char_color(name)
                plt.bar(np.arange(0, 500*interval, interval),
                        dmg_sum, width=[interval]*500, bottom=bottom_sum,
                        align='edge', alpha=0.7, label=name, color=color)
            else:
                plt.bar(np.arange(0, 500*interval, interval),
                        dmg_sum, width=[interval]*500, bottom=bottom_sum,
                        align='edge', alpha=0.7, label=name)
            bottom_sum += dmg_sum
        plt.legend()
        plt.ylim(bottom=0)
        plt.xlim(0, end)
        plt.ylabel('Damage')
        plt.xlabel('time / s')
        plt.title('Damage stackbar plot')
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

    def print_heal_one(self, name: str, interval: float = 1):
        start, end = 0, 0
        heal_sum = [0]*500

        fig, ax = plt.subplots()

        line: List[Tuple[float, float]] = self.controller.heal_log[name]
        for t, d in line:
            d = max(0, d)
            heal_sum[int(t/interval)] += (d/interval)
        x, y = zip(*line)
        times = np.array(x)
        heals = np.abs(np.array(y))
        end = max(end, times[-1])
        start = min(start, times[0])
        color = self.cm.get_char_color(name) if self.cm else 'deepskyblue'

        markerline, stemlines, baseline = ax.stem(
            times, heals, label=name+'.heal')
        markerline.set(color=color, marker='o',
                       markersize=9, markeredgecolor='w',
                       markeredgewidth=1)
        stemlines.set(color=color, alpha=0.5, linewidth=2)
        baseline.set(color='w')

        start = int(start)
        end = ceil(end+1)
        color = self.cm.get_char_color(name) if self.cm else 'cyan'
        ax.bar(np.arange(0, 500*interval, interval),
               heal_sum, width=[interval]*500,
               align='edge', alpha=0.5, color=color)

        plt.legend()
        plt.ylim(bottom=0)
        plt.xlim(start, end)
        plt.ylabel('Heal')
        plt.xlabel('time / s')
        plt.title(f'Heal Log for {name}')
        plt.grid(True, 'both', alpha=0.7)
        plt.tight_layout()
        plt.show()

    def print_element_log(self):
        lines = []
        labels = []
        max_x = 0
        for k in self.controller.element_log:
            line = np.array(self.controller.element_log[k])
            lines.append(line)
            labels.append(k)
        for i, k in enumerate(labels):
            if self.cm:
                color = self.cm.get_element_color(k) \
                    if k != 'FROZEN' else \
                    self.cm.get_element_color('CRYO')
                if k == 'FROZEN':
                    plt.plot(np.arange(0, len(lines[i])/10, 0.1), lines[i], label=k,
                             color=color, linestyle='--')
                else:
                    plt.plot(np.arange(0, len(lines[i])/10, 0.1), lines[i], label=k,
                             color=color)
            else:
                plt.plot(
                    np.arange(0, len(lines[i])/10, 0.1), lines[i], label=k)
            max_x = max(max_x, len(lines[i])/10)
        plt.legend()
        plt.xlim(0, ceil(max_x))
        plt.ylim(0, 4.2)
        plt.yticks(np.linspace(0, 4, 21))
        plt.ylabel('Gauge Unit / U')
        plt.xlabel('time / s')
        plt.grid(True, 'both', alpha=0.7)
        plt.title('Element Log')
        plt.tight_layout()
        plt.show()

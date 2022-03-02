from math import ceil
from typing import TYPE_CHECKING, List
import numpy as np
import matplotlib.pyplot as plt
if TYPE_CHECKING:
    from core.entities.numeric import NumericController


class LogPrinter(object):
    def __init__(self, controller: 'NumericController'):
        self.controller = controller

    def print_char_log(self, name: str, interest: List[str]):
        lines = []
        for k in interest:
            line = np.array(self.controller.char_attr_log[name][k])
            lines.append(line)

        fig, ax = plt.subplots()
        for i, k in enumerate(interest):
            ax.plot(
                np.arange(0, len(lines[i])/10, 0.1),
                lines[i],
                label=k
            )
        ax.legend()
        plt.xlim(left=0)
        plt.ylim(bottom=0)
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
            ax.plot(
                np.arange(0, len(lines[i])/10, 0.1),
                lines[i],
                label=k
            )
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
            ax.plot(
                times[i], damages[i],
                label=k, linestyle='-', marker='o'
            )
        ax.legend()
        plt.ylim(bottom=0)
        plt.xlim(left=0)
        plt.ylabel('Damage')
        plt.xlabel('time / s')
        plt.title('Damage Log')
        plt.grid(True, 'both', alpha=0.7)
        plt.tight_layout()
        plt.show()

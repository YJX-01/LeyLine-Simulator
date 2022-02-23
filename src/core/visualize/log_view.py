from typing import TYPE_CHECKING, List
import numpy as np
import matplotlib.pyplot as plt
if TYPE_CHECKING:
    from core.entities.numeric import NumericController


class LogPrinter(object):
    def __init__(self, controller: 'NumericController'):
        self.controller = controller

    def print_char_log(self, name, interest: List[str]):
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
        plt.show()

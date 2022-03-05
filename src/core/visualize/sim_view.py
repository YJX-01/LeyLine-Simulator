from math import ceil
from typing import TYPE_CHECKING, List
from core.rules.alltypes import EventType, ActionType, ElementType
from core.simulation.event import *
from core.visualize.genshin_color import ColorManager
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
import matplotlib.patches as mp
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation


class SimPrinter(object):
    def __init__(self, simulation: 'Simulation'):
        self.sim = simulation
        self.cm = ColorManager(simulation)

    def print_action(self, names: List[str], onstage_record: List = []):
        fig, ax = plt.subplots()

        if onstage_record:
            for record in onstage_record:
                facecolor = self.cm.get_char_color(record[0])
                textcolor = self.text_color(facecolor)
                rect = ax.barh('On Stage', record[2]-record[1], left=record[1],
                               color=facecolor, height=0.6, edgecolor='grey')
                ax.bar_label(rect, labels=[record[0]], fontsize='small',
                             label_type='center', color=textcolor)

        high = 0
        action_list: List['ActionEvent'] = [
            ev for ev in self.sim.event_log
            if ev.type == EventType.ACTION and ev.sourcename in names
        ]
        for action_event in action_list:
            facecolor = self.cm.get_action_color(action_event)
            textcolor = self.text_color(facecolor)
            rowname, label = self.format_action_info(action_event)
            rect = ax.barh(rowname, action_event.dur, left=action_event.time,
                           label=rowname, color=facecolor,
                           height=0.6, edgecolor='darkgrey')
            ax.bar_label(rect, labels=[label], fontsize='small',
                         label_type='center', color=textcolor)
            high = max(high, action_event.time+action_event.dur)

        if onstage_record:
            high = max(onstage_record[-1][-1], high)
        high = ceil(high)
        ax.set_xlim(0, high)
        ax.set_axisbelow(True)
        ax.invert_yaxis()
        ax.xaxis.grid(linestyle='--', alpha=0.5, which='both')
        xt = np.linspace(0, high, 2*high+1)[::2]
        ax.set_xticks(xt)
        xt_minor = np.linspace(0, high, 2*high+1)
        ax.set_xticks(xt_minor, minor=True)
        plt.xlabel('time / s')
        plt.title('Action Gantt Graph')
        plt.tight_layout()
        plt.show()

    def print_buffs(self, onstage_record: List = []):
        fig, ax = plt.subplots()

        if onstage_record:
            for record in onstage_record:
                facecolor = self.cm.get_char_color(record[0])
                textcolor = self.text_color(facecolor)
                rect = ax.barh('On Stage', record[2]-record[1], left=record[1],
                               color=facecolor, height=0.6, edgecolor='grey')
                ax.bar_label(rect, labels=[record[0]], fontsize='small',
                             label_type='center', color=textcolor)
                upper_limit = onstage_record[-1][-1]

        high = 0
        buff_list: List['BuffEvent'] = [
            ev for ev in self.sim.event_log
            if ev.type == EventType.BUFF
        ]
        for buff_event in buff_list:
            facecolor = self.cm.get_buff_color(buff_event)
            textcolor = self.text_color(facecolor)
            rowname = buff_event.desc
            max_dur = min(buff_event.duration, upper_limit-buff_event.time)
            rect = ax.barh(rowname, max_dur, left=buff_event.time,
                           label=rowname, color=facecolor,
                           height=0.6, edgecolor='darkgrey')
            ax.bar_label(rect, labels=[rowname], fontsize='small',
                         label_type='center', color=textcolor)
            high = max(high, buff_event.time+buff_event.duration)

        high = ceil(min(high, upper_limit))
        ax.set_xlim(0, high)
        ax.set_axisbelow(True)
        ax.invert_yaxis()
        ax.xaxis.grid(linestyle='--', alpha=0.5, which='both')
        xt = np.linspace(0, high, 2*high+1)[::2]
        ax.set_xticks(xt)
        xt_minor = np.linspace(0, high, 2*high+1)
        ax.set_xticks(xt_minor, minor=True)
        plt.xlabel('time / s')
        plt.title('Buff Gantt Graph')
        plt.show()

    def print_energy(self):
        return

    def print_element(self, names: List[str] = []):
        element_event = [
            ev for ev in self.sim.event_log
            if ev.type == EventType.ELEMENT and ev.subtype == 'apply'
        ]
        last = element_event[-1].time+5
        patches = [
            mp.Patch(color=self.cm.get_element_color(c), label=c)
            for c in ElementType.__members__.keys()
            if c != 'NONE' and c != 'PHYSICAL' and c != 'DENDRO'
        ]

        for ev in element_event:
            if names and ev.sourcename not in names:
                continue
            markerline, stemlines, baseline = plt.stem(ev.time, ev.num)
            color = self.cm.get_element_color(ev.elem)
            markerline.set(color=color, markersize=ev.num*6)
            stemlines.set_color(color)
        plt.ylim(0, 5)
        plt.yticks([0, 1, 2, 4])
        plt.ylabel('Gauge Unit')
        plt.xlim(0, last)
        plt.xlabel('time / s')
        plt.grid(True, 'both', alpha=0.5)
        plt.title('Aura Log')
        plt.legend(handles=patches)
        plt.show()

    @staticmethod
    def text_color(color):
        r, g, b = mcolors.to_rgb(color)
        return 'white' if r*g*b < 0.5 else 'darkgrey'

    @staticmethod
    def format_action_info(action_event: 'ActionEvent'):
        rowname_map = {1: 'A', 2: 'A', 3: 'A',
                       4: 'E', 5: 'E', 6: 'Q',
                       10: 'A', 11: 'A'}
        row = rowname_map[action_event.subtype.value]
        rowname = action_event.sourcename + '.' + row

        labelname_map = {2: 'Z', 3: 'P', 10: 'J', 11: 'S'}
        if row != 'A':
            label = '.' + row
        else:
            if labelname_map.get(action_event.subtype.value, False):
                label = '.' + labelname_map[action_event.subtype.value]
            else:
                s = action_event.desc.split('.')[-1]
                if s[0].isnumeric():
                    label = '.' + s
                else:
                    label = ''.join(['.']+[i[0] for i in s.split('_')])
        return rowname, label

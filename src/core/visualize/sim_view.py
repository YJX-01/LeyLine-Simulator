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
        while buff_list:
            buff_event = buff_list.pop(0)
            facecolor = self.cm.get_buff_color(buff_event)
            textcolor = self.text_color(facecolor)
            rowname = buff_event.desc

            # find and merge same buff
            max_dur = buff_event.duration
            mergelist = []
            for i, ev in enumerate(buff_list):
                if ev.desc == buff_event.desc and ev.sourcename == buff_event.sourcename and ev.time - buff_event.time <= max_dur:
                    mergelist.append(i)
                    max_dur = ev.duration + ev.time - buff_event.time
                elif ev.desc == buff_event.desc and ev.sourcename != buff_event.sourcename and ev.time - buff_event.time <= max_dur:
                    max_dur = ev.time - buff_event.time
                    break

            for m in reversed(mergelist):
                buff_list.pop(m)

            max_dur = min(max_dur, upper_limit-buff_event.time)
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

    def print_energy(self, onstage_record: List):
        fig = plt.figure(figsize=(8, 6))

        gs = fig.add_gridspec(2, 1, height_ratios=(8, 1),
                              bottom=0.1, top=0.9, hspace=0.1)

        ax_stage = fig.add_subplot(gs[1, 0])
        ax = fig.add_subplot(gs[0, 0], sharex=ax_stage)

        for record in onstage_record:
            facecolor = self.cm.get_char_color(record[0])
            textcolor = self.text_color(facecolor)
            rect = ax_stage.barh('On Stage', record[2]-record[1], left=record[1],
                                 color=facecolor, height=0.1, edgecolor='grey')
            ax_stage.bar_label(rect, labels=[record[0]], fontsize='small',
                               label_type='center', color=textcolor)
            upper_limit = onstage_record[-1][-1]
        ax_stage.set_xlim(0, upper_limit)
        ax_stage.set_xticks(np.arange(0, ceil(upper_limit+1), 2))
        ax_stage.set_axis_off()

        energy_events = [
            ev for ev in self.sim.event_log
            if ev.type == EventType.ENERGY
        ]
        patches = [
            mp.Patch(color=self.cm.get_element_color(c), label=c)
            for c in ElementType.__members__.keys()
            if c != 'PHYSICAL' and c != 'DENDRO'
        ]

        for ev in energy_events:
            if ev.subtype == 'particle':
                base = ev.base*ev.num
                ax.scatter(ev.time, ev.num, s=base*50, marker='o',
                           color=self.cm.get_element_color(ev.elem))
            elif ev.subtype == 'orb':
                base = ev.base*ev.num
                ax.scatter(ev.time, ev.num, s=base*100, marker='s',
                           color=self.cm.get_element_color(ev.elem))
            elif ev.subtype == 'const':
                base = ev.num
                ax.scatter(ev.time, base, s=base*50, marker='D',
                           color=self.cm.get_element_color(ev.elem))
        ax.set_ylim(bottom=0)
        
        plt.grid(True, 'both', alpha=0.5)
        plt.ylabel('Base Energy')
        plt.title('Energy Log')
        plt.legend(handles=patches)
        plt.show()

    def print_element(self, names: List[str] = []):
        element_events = [
            ev for ev in self.sim.event_log
            if ev.type == EventType.ELEMENT and ev.subtype == 'apply'
        ]
        last = element_events[-1].time+5
        patches = [
            mp.Patch(color=self.cm.get_element_color(c), label=c)
            for c in ElementType.__members__.keys()
            if c != 'NONE' and c != 'PHYSICAL' and c != 'DENDRO'
        ]

        for ev in element_events:
            if names and ev.sourcename not in names:
                continue
            markerline, stemlines, baseline = plt.stem(ev.time, ev.num)
            color = self.cm.get_element_color(ev.elem)
            markerline.set(color=color, markersize=ev.num*6, alpha=0.8)
            stemlines.set(color=color, alpha=0.5)
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

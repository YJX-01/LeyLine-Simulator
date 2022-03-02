from typing import TYPE_CHECKING, Union
from random import random
from core.rules.alltypes import ElementType, BuffType
from core.simulation.event import ActionEvent, BuffEvent
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
if TYPE_CHECKING:
    from core.simulation.simulation import Simulation


class ColorManager(object):
    colormap = {
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
                'electro2', [(0, '#ad5389'), (1, '#8D0B93')], N=32),
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
                'hydro4', [(0, '#0082c8'), (1, '#4e54c8')], N=32),
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
                'cryo1', [(0, '#B2FEFA'), (1, '#9CECFB')], N=32),
            mcolors.LinearSegmentedColormap.from_list(
                'cryo2', [(0, '#b6fbff'), (1, '#CFDEF3')], N=32),
            mcolors.LinearSegmentedColormap.from_list(
                'cryo3', [(0, '#89f7fe'), (1, '#ace0f9')], N=32),
            mcolors.LinearSegmentedColormap.from_list(
                'cryo4', [(0, '#e7f0fd'), (1, '#accbee')], N=32),
        ],
    }

    def __init__(self, simulation: 'Simulation'):
        self.characters = dict.fromkeys(simulation.shortcut.values())
        self.elem_map = dict.fromkeys(simulation.shortcut.values())
        self.build_map(simulation)

    def build_map(self, simulation: 'Simulation'):
        for character in simulation.characters.values():
            self.elem_map[character.name] = ElementType(character.base.element)
        cnt = dict.fromkeys(ElementType.__members__.keys(), 0)
        for k, v in self.elem_map.items():
            i = cnt[v.name]
            cnt[v.name] += 1
            self.characters[k] = self.colormap[v.name][i]

    def get_char_colormap(self, name: str) -> mcolors.LinearSegmentedColormap:
        return self.characters[name]

    def get_char_color(self, name: str):
        return self.characters[name](1)

    def get_element_color(self, element: Union[ElementType, str]):
        if isinstance(element, str):
            return self.colormap[element.upper()][0](0)
        elif isinstance(element, ElementType):
            return self.colormap[element.name][0](0)

    def get_action_color(self, action_event: 'ActionEvent'):
        name = action_event.sourcename
        index = action_event.subtype.value
        if index in [1, 2, 3]:
            if index == 1:
                s = action_event.desc.split('.')[-1][0]
                i = int(s) if s.isnumeric() else 0
                return self.characters[name](0.25+i/32)
            else:
                return self.characters[name](0.25+(index+4)/32)
        elif index in [4, 5]:
            return self.characters[name](0.5+(index-4)/8)
        elif index == 6:
            return self.characters[name](0.75)
    
    def get_buff_color(self, buff_event: 'BuffEvent'):
        buff_type = buff_event.subtype
        if buff_type == BuffType.ATTR:
            cmap = plt.colormaps['cool']
            return cmap(random())
        elif buff_type == BuffType.DMG:
            cmap = plt.colormaps['winter']
            return cmap(random())
        else:
            cmap = plt.colormaps['autumn']
            return cmap(random())
    
    def get_creation_color(self, creation_event):
        pass

    def test(self, arg):
        try:
            plt.bar([1], [1], color=arg)
            print('color bar')
            plt.show()
        except:
            ar = np.linspace(0, 1, 32)
            ar = np.vstack(ar)
            plt.imshow(ar, cmap=arg, aspect='auto')
            print('imshow')
            plt.show()

    def showall(self):
        fig, axs = plt.subplots(ncols=24)
        ar = np.linspace(0, 1, 32)
        ar = np.vstack(ar)
        all_map = [vv for v in self.colormap.values() for vv in v]
        for ax, c in zip(axs, all_map):
            ax.imshow(ar, cmap=c, aspect='auto')
            ax.set_axis_off()
        plt.show()

class Wrapper(object):
    def __init__(self, config, **kwargs):
        self._config = config
        self.__data = {}
        for k, v in kwargs.items():
            self[k] = v
    
    def __getitem__(self, key):
        if key not in self._config:
            raise KeyError(key)
        if key not in self.__data:
            self._config[key]()
        return self.__data[key]
    
    def __setitem__(self, key, value):
        if key not in self._config:
            raise KeyError(key)
        self.__data[key] = value
    
    def __delitem__(self, key):
        if key not in self._config:
            raise KeyError(key)
        del self.__data[key]
    
    def __repr__(self) -> str:
        return str(self.__data)


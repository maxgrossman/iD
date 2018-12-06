import _extend from 'lodash-es/extend';

export function osmoseError() {
    if (!(this instanceof osmoseError)) {
        return (new osmoseError()).initialize(arguments);
    } else if (arguments.length) {
        this.initialize(arguments);
    }
}


osmoseError.id = function() {
    return osmoseError.id.next--;
};


osmoseError.id.next = -1;


_extend(osmoseError.prototype, {

    type: 'osmose_error',

    initialize: function(props) {
        for (var prop in props) {
            this[props] = props[prop]; 
        }

        if (!this.id) {
            this.id = osmoseError.id() + '';  // as string
        }

        return this;
    },

    update: function(attrs) {
        return osmoseError(this, attrs); // {v: 1 + (this.v || 0)}
    },

    isNew: function() {
        return this.id < 0;
    },

});

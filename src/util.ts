export class TwoWayMap<A, B> {
    private mapAToB = new Map<A, B>();
    private mapBToA = new Map<B, A>();

    set(a: A, b: B) {
        this.mapAToB.set(a, b);
        this.mapBToA.set(b, a);
    }

    has(a: A) {
        return this.mapAToB.has(a);
    }
    hasReverse(b: B) {
        return this.mapBToA.has(b);
    }

    delete(a: A) {
        if(this.mapAToB.has(a)) {
            this.mapBToA.delete(this.mapAToB.get(a)!);
            this.mapAToB.delete(a);
        }
    }
    deleteReverse(b: B) {
        if(this.mapBToA.has(b)) {
            this.mapAToB.delete(this.mapBToA.get(b)!);
            this.mapBToA.delete(b);
        }
    }

    get(a: A) {
        return this.mapAToB.get(a);
    }
    getReverse(b: B) {
        return this.mapBToA.get(b);
    }
}

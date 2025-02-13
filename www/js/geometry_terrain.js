export default class GeometryTerrain {

    constructor(vertices) {
        this.vertices = vertices;
        this.updateID = 0;
        this.uploadID = -1;

        this.strideFloats = GeometryTerrain.strideFloats;
        this.stride = this.strideFloats * 4;

        if (vertices instanceof Array) {
            this.data = new Float32Array(vertices);
        } else {
            this.data = vertices;
        }
        this.size = this.data.length / this.strideFloats;

        this.glSize = 0;
        this.glBuffer = 0;
        this.vao = null;
    }

    createVao()
    {
        const { attribs, gl, stride } = this;
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        gl.enableVertexAttribArray(attribs.a_position);
        gl.enableVertexAttribArray(attribs.a_axisX);
        gl.enableVertexAttribArray(attribs.a_axisY);
        gl.enableVertexAttribArray(attribs.a_uvCenter);
        gl.enableVertexAttribArray(attribs.a_uvSize);
        gl.enableVertexAttribArray(attribs.a_color);
        gl.enableVertexAttribArray(attribs.a_occlusion);
        gl.enableVertexAttribArray(attribs.a_flags);

        gl.enableVertexAttribArray(attribs.a_quad);
        gl.enableVertexAttribArray(attribs.a_quadOcc);

        this.glBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.glBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.data, gl.DYNAMIC_DRAW);
        this.glSize = this.data.length;

        gl.vertexAttribPointer(attribs.a_position, 3, gl.FLOAT, false, stride, 0);
        gl.vertexAttribPointer(attribs.a_axisX, 3, gl.FLOAT, false, stride, 3 * 4);
        gl.vertexAttribPointer(attribs.a_axisY, 3, gl.FLOAT, false, stride, 6 * 4);
        gl.vertexAttribPointer(attribs.a_uvCenter, 2, gl.FLOAT, false, stride, 9 * 4);
        gl.vertexAttribPointer(attribs.a_uvSize, 2, gl.FLOAT, false, stride, 11 * 4);
        gl.vertexAttribPointer(attribs.a_color, 3, gl.FLOAT, false, stride, 13 * 4);
        gl.vertexAttribPointer(attribs.a_occlusion, 4, gl.FLOAT, false, stride, 16 * 4);
        gl.vertexAttribPointer(attribs.a_flags, 1, gl.FLOAT, false, stride, 20 * 4);

        gl.vertexAttribDivisor(attribs.a_position, 1);
        gl.vertexAttribDivisor(attribs.a_axisX, 1);
        gl.vertexAttribDivisor(attribs.a_axisY, 1);
        gl.vertexAttribDivisor(attribs.a_uvCenter, 1);
        gl.vertexAttribDivisor(attribs.a_uvSize, 1);
        gl.vertexAttribDivisor(attribs.a_color, 1);
        gl.vertexAttribDivisor(attribs.a_occlusion, 1);
        gl.vertexAttribDivisor(attribs.a_flags, 1);

        GeometryTerrain.bindQuad(gl);
        gl.vertexAttribPointer(attribs.a_quad, 2, gl.FLOAT, false, 6 * 4, 0);
        gl.vertexAttribPointer(attribs.a_quadOcc, 4, gl.FLOAT, false, 6 * 4, 2 * 4);
    }

    bind(render)
    {
        if (render) {
            this.attribs = render;
            this.gl = render.gl;
        }

        const { gl } = this;
        if (!this.vao) {
            this.createVao();
            this.uploadID = this.updateID;
            return;
        }
        gl.bindVertexArray(this.vao);
        if (this.uploadID === this.updateID) {
            return;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.glBuffer);
        if (this.glSize < this.data.length) {
            gl.bufferData(gl.ARRAY_BUFFER, this.data, gl.DYNAMIC_DRAW);
            this.glSize = this.data.length;
        } else {
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data);
        }
    }

    updateInternal(data) {
        if (data) {
            if (data instanceof Array) {
                this.data = new Float32Array(data);
            } else {
                this.data = data;
            }
        }
        this.size = this.data.length / this.strideFloats;
        this.updateID++;
    }

    destroy() {
        if (this.glBuffer) {
            this.gl.deleteBuffer(this.glBuffer);
            this.glBuffer = null;
            this.gl.deleteVertexArray(this.vao);
            this.vao = null;
        }
    }

    static quadBuf = null;
    static bindQuad(gl) {
        if (GeometryTerrain.quadBuf) {
            gl.bindBuffer(gl.ARRAY_BUFFER, GeometryTerrain.quadBuf);
            return;
        }
        const quadBuf = GeometryTerrain.quadBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
        const quad = new Float32Array([
            -.5, -.5, 1, 0, 0, 0,
            .5, -.5, 0, 1, 0, 0,
            .5, .5, 0, 0, 1, 0,
            -.5, -.5, 1, 0, 0, 0,
            .5, .5, 0, 0, 1, 0,
            -.5, .5, 0, 0, 0, 1]);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    }

    static convertFrom12(vertices) {
        const oldStride = 12;
        const len = vertices.length / oldStride / 6;
        const newArr = new Float32Array(len * GeometryTerrain.strideFloats);
        let k = 0;
        for (let j = 0; j < vertices.length; j += oldStride * 6) {
            let du = 0, dv = 0, dd = 0, d0 = 0;
            for (let i = oldStride; i < oldStride * 6; i += oldStride) {
                if (vertices[j + i + 3] !== vertices[j + 3]) {
                    if (vertices[j + i + 4] !== vertices[j + 4]) {
                        dd = i;
                    } else {
                        du = i;
                    }
                } else {
                    if (vertices[j + i + 4] !== vertices[j + 4]) {
                        dv = i;
                    }
                }
            }

            // position
            newArr[k++] = (vertices[j + dd] + vertices[j + d0]) * 0.5;
            newArr[k++] = (vertices[j + dd + 1] + vertices[j + d0 + 1]) * 0.5;
            newArr[k++] = (vertices[j + dd + 2] + vertices[j + d0 + 2]) * 0.5;
            // axisX
            const ux = (vertices[j + du] - vertices[j + d0]);
            const uy = (vertices[j + du + 1] - vertices[j + d0 + 1]);
            const uz = (vertices[j + du + 2] - vertices[j + d0 + 2]);
            // axisY
            let vx = (vertices[j + dv] - vertices[j + d0]);
            let vy = (vertices[j + dv + 1] - vertices[j + d0 + 1]);
            let vz = (vertices[j + dv + 2] - vertices[j + d0 + 2]);

            const nx = uy * vz - vy * uz;
            const ny = uz * vx - vz * ux;
            const nz = ux * vy - vx * uy;

            const dot = nx * vertices[j + 9] + ny * vertices[j + 11] + nz * vertices[j + 10];
            // if (dot < 0) {
            //     vx = -vx;
            //     vy = -vy;
            //     vz = -vz;
            //     let tmp = d0; d0 = dv; dv = tmp;
            //     tmp = du; du = dd; dd = tmp;
            // }
            newArr[k++] = ux;
            newArr[k++] = uy;
            newArr[k++] = uz;

            newArr[k++] = vx;
            newArr[k++] = vy;
            newArr[k++] = vz;

                // uvCenter
            newArr[k++] = (vertices[j + dd + 3] + vertices[j + d0 + 3]) * 0.5;
            newArr[k++] = (vertices[j + dd + 4] + vertices[j + d0 + 4]) * 0.5;
            // uvSize2
            newArr[k++] = (vertices[j + dd + 3] - vertices[j + d0 + 3]);
            newArr[k++] = (vertices[j + dd + 4] - vertices[j + d0 + 4]);
            // color
            newArr[k++] = vertices[j + 5];
            newArr[k++] = vertices[j + 6];
            newArr[k++] = vertices[j + 7];
            // occlusion
            newArr[k++] = vertices[j + d0 + 8];
            newArr[k++] = vertices[j + du + 8];
            newArr[k++] = vertices[j + dd + 8];
            newArr[k++] = vertices[j + dv + 8];

            newArr[k++] = Math.abs(dot) < 1e-6 ? 1 : 0;
        }

        return newArr;
    }

    static strideFloats = 21;
}

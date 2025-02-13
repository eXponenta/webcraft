import {Vector, MyArray} from "./helpers.js";
import Chunk from "./chunk.js";
import {BLOCK, CHUNK_SIZE_X, CHUNK_SIZE_Z} from "./blocks.js";
import ServerClient from "./server_client.js";

//
export class ChunkManager {

    constructor(world) {
        let that                    = this;
        this.CHUNK_RENDER_DIST      = 7; // 0(1chunk), 1(9), 2(25chunks), 3(45), 4(69), 5(109), 6(145), 7(193), 8(249) 9(305) 10(373) 11(437) 12(517)
        this.chunks                 = {};
        this.chunks_prepare         = {};
        this.modify_list            = {};
        this.world                  = world;
        this.margin                 = Math.max(this.CHUNK_RENDER_DIST + 1, 1);
        this.rendered_chunks        = {fact: 0, total: 0};
        this.update_chunks          = true;
        this.vertices_length_total  = 0;
        this.worker                 = new Worker('./js/chunk_worker.js'/*, {type: 'module'}*/);
        // Message received from worker
        this.worker.onmessage = function(e) {
            const cmd = e.data[0];
            const args = e.data[1];
            switch(cmd) {
                case 'blocks_generated': {
                    if(that.chunks.hasOwnProperty(args.key)) {
                        that.chunks[args.key].onBlocksGenerated(args);
                    }
                    break;
                }
                case 'vertices_generated': {
                    if(that.chunks.hasOwnProperty(args.key)) {
                        that.chunks[args.key].onVerticesGenerated(args);
                    }
                    break;
                }
                case 'vertices_generated_many': {
                    for(let result of args) {
                        if(that.chunks.hasOwnProperty(result.key)) {
                            that.chunks[result.key].onVerticesGenerated(result);
                        }
                    }
                    break;
                }
            }
        }
    }

    //
    setRenderDist(value) {
        value = Math.max(value, 4);
        value = Math.min(value, 50);
        this.CHUNK_RENDER_DIST = value;
        this.margin = Math.max(this.CHUNK_RENDER_DIST + 1, 1)
    }

    // toggleUpdateChunks
    toggleUpdateChunks() {
        this.update_chunks = !this.update_chunks;
    }

    // shift
    shift(shift) {
        let points      = 0;
        const renderer  = this.world.renderer
        const gl        = renderer.gl;
        gl.useProgram(renderer.program);
        for(let key of Object.keys(this.chunks)) {
            points += this.chunks[key].doShift(shift);
        }
        return points;
    }

    // refresh
    refresh() {
    }

    // Draw level chunks
    draw(render) {
        let gl = render.gl;
        this.rendered_chunks.total  = Object.keys(this.chunks).length;
        this.rendered_chunks.fact   = 0;
        let applyVerticesCan        = 1;
        let a_pos                   = new Vector(0, 0, 0);
        // Для отрисовки чанков по спирали от центрального вокруг игрока
        this.spiral_moves = this.createSpiralCoords(this.margin * 2);
        // чанк, в котором стоит игрок
        let overChunk = Game.world.localPlayer.overChunk;
        if(overChunk) {
            // draw
            for(let group of ['regular', 'doubleface', 'transparent']) {
                let transparent = group != 'regular';
                let opaque = group !== 'transparent';
                if(transparent) {
                    gl.disable(gl.CULL_FACE);
                }
                if (opaque) {
                    gl.uniform1f(render.u_opaqueThreshold, 0.5);
                }
                for(let sm of this.spiral_moves) {
                    let pos = new Vector(
                        overChunk.addr.x + sm.x - this.margin,
                        overChunk.addr.y + sm.y,
                        overChunk.addr.z + sm.z - this.margin
                    );
                    let chunk = this.getChunk(pos);
                    if(chunk) {
                        this.rendered_chunks.fact += 0.33333;
                        if(chunk.hasOwnProperty('vertices_args')) {
                            if(applyVerticesCan-- > 0) {
                                chunk.applyVertices();
                            }
                        }
                        chunk.drawBufferGroup(group, a_pos);
                    }
                }
                if(transparent) {
                    gl.enable(gl.CULL_FACE);
                }
                if (opaque) {
                    gl.uniform1f(render.u_opaqueThreshold, 0.0);
                }
            }
        }
        return true;
    }

    // Get
    getChunk(pos) {
        let k = this.getPosChunkKey(pos);
        if(this.chunks.hasOwnProperty(k)) {
            return this.chunks[k];
        }
        return null;
    }

    // Add
    addChunk(pos) {
        let k = this.getPosChunkKey(pos);
        if(!this.chunks.hasOwnProperty(k) && !this.chunks_prepare.hasOwnProperty(k)) {
            this.chunks_prepare[k] = {
                start_time: performance.now()
            };
            this.world.server.ChunkAdd(pos);
            return true;
        }
        return false;
    }

    // Remove
    removeChunk(pos) {
        let k = this.getPosChunkKey(pos);
        this.vertices_length_total -= this.chunks[k].vertices_length;
        this.chunks[k].destruct();
        delete this.chunks[k];
        this.world.server.ChunkRemove(pos);
    }

    // postWorkerMessage
    postWorkerMessage(data) {
        this.worker.postMessage(data);
    };

    // Установить начальное состояние указанного чанка
    setChunkState(state) {
        let k = this.getPosChunkKey(state.pos);
        if(this.chunks_prepare.hasOwnProperty(k)) {
            let prepare = this.chunks_prepare[k];
            let chunk = new Chunk(this, state.pos, state.modify_list);
            chunk.load_time = performance.now() - prepare.start_time;
            delete(this.chunks_prepare[k]);
            this.chunks[k] = chunk;
        }
    }

    // createSpiralMoves ...
    createSpiralCoords(size) {
        if(this.hasOwnProperty(size)) {
            return this[size];
        }
        let resp = [];
        let margin = this.margin;
        function rPush(vec) {
            // Если позиция на расстояние видимости (считаем честно, по кругу)
            let dist = Math.sqrt(Math.pow(vec.x - size / 2, 2) + Math.pow(vec.z - size / 2, 2));
            if(dist < margin) {
                resp.push(vec);
            }
        }
        let iInd = parseInt(size / 2);
        let jInd = parseInt(size / 2);
        let iStep = 1;
        let jStep = 1;
        rPush(new Vector(iInd, 0, jInd));
        for(let i = 0; i < size; i++) {
            for (let h = 0; h < i; h++) rPush(new Vector(iInd, 0, jInd += jStep));
            for (let v = 0; v < i; v++) rPush(new Vector(iInd += iStep, 0, jInd));
            jStep = -jStep;
            iStep = -iStep;
        }
        for(let h = 0; h < size - 1; h++) {
            rPush(new Vector(iInd, 0, jInd += jStep));
        }
        this[size] = resp;
        return resp;
    }

    // Update
    update() {
        if(!this.update_chunks) {
            return;
        }
        let world = this.world;
        let spiral_moves = this.createSpiralCoords(this.margin * 2);
        let chunkPos = this.getChunkPos(world.spawnPoint.x, world.spawnPoint.y, world.spawnPoint.z);
        if(world.localPlayer) {
            chunkPos = this.getChunkPos(world.localPlayer.pos.x, world.localPlayer.pos.y, world.localPlayer.pos.z);
        }
        if(Object.keys(Game.world.chunkManager.chunks).length != spiral_moves.length || (this.prevChunkPos && this.prevChunkPos.distance(chunkPos) > 0)) {
            this.prevChunkPos = chunkPos;
            let actual_keys = {};
            let can_add = 3;
            for(let key of Object.keys(this.chunks)) {
                if(!this.chunks[key].inited) {
                    can_add = 0;
                    break;
                }
            }
            for(let sm of spiral_moves) {
                let pos = new Vector(
                    chunkPos.x + sm.x - this.margin,
                    chunkPos.y + sm.y,
                    chunkPos.z + sm.z - this.margin
                );
                actual_keys[this.getPosChunkKey(pos)] = pos;
                if(can_add > 0) {
                    if(this.addChunk(pos)) {
                        can_add--;
                    }
                }
            }
            // check for remove
            for(let key of Object.keys(this.chunks)) {
                if(!actual_keys.hasOwnProperty(key)) {
                    this.removeChunk(this.parseChunkPos(key));
                }
            }
        }
        // detect dirty chunks
        let dirty_chunks = [];
        for(let key of Object.keys(this.chunks)) {
            let chunk = this.chunks[key];
            if(chunk.dirty && !chunk.buildVerticesInProgress) {
                if(
                    this.getChunk(new Vector(chunk.addr.x - 1, chunk.addr.y, chunk.addr.z)) &&
                    this.getChunk(new Vector(chunk.addr.x + 1, chunk.addr.y, chunk.addr.z)) &&
                    this.getChunk(new Vector(chunk.addr.x, chunk.addr.y, chunk.addr.z - 1)) &&
                    this.getChunk(new Vector(chunk.addr.x, chunk.addr.y, chunk.addr.z + 1))
                ) {
                    dirty_chunks.push({
                        coord: chunk.coord,
                        key: chunk.key
                    });
                }
            }
        }
        if(dirty_chunks.length > 0) {
            if(dirty_chunks.length == 2 || dirty_chunks.length == 3) {
                let keys = [];
                for(let dc of dirty_chunks) {
                    this.chunks[dc.key].buildVerticesInProgress = true;
                    keys.push(dc.key)
                }
                // Run webworker method
                this.postWorkerMessage(['buildVerticesMany', {keys: keys, shift: Game.shift}]);
            } else {
                // sort dirty chunks by dist from player
                dirty_chunks = MyArray.from(dirty_chunks).sortBy('coord');
                // rebuild dirty chunks
                let buildCount = 1;
                for(let dc of dirty_chunks) {
                    if(this.chunks[dc.key].buildVertices()) {
                        if(--buildCount == 0) {
                            break;
                        }
                    }
                }
            }
        }
    }

    getPosChunkKey(pos) {
        return 'c_' + pos.x + '_' + pos.y + '_' + pos.z;
    }

    parseChunkPos(key) {
        let k = key.split('_');
        return new Vector(parseInt(k[1]), parseInt(k[2]), parseInt(k[3]));
    }

    // Возвращает относительные координаты чанка по глобальным абсолютным координатам
    getChunkPos(x, y, z) {
        let v = new Vector(
            parseInt(x / CHUNK_SIZE_X),
            0,
            parseInt(z / CHUNK_SIZE_Z)
        );
        if(x < 0) {v.x--;}
        if(z < 0) {v.z--;}
        if(v.x == 0) {v.x = 0;}
        if(v.y == 0) {v.y = 0;}
        if(v.z == 0) {v.z = 0;}
        return v;
    }

    // Возвращает блок по абслютным координатам
    getBlock(x, y, z) {
        // определяем относительные координаты чанка
        let chunkPos = this.getChunkPos(x, y, z);
        // обращаемся к чанку
        let chunk = this.getChunk(chunkPos);
        // если чанк найден
        if(chunk) {
            // просим вернуть блок передав абсолютные координаты
            return chunk.getBlock(x, y, z);
        }
        return BLOCK.DUMMY;
    }

    // setBlock
    setBlock(x, y, z, block, is_modify, power, rotate, entity_id) {
        // определяем относительные координаты чанка
        let chunkPos = this.getChunkPos(x, y, z);
        // обращаемся к чанку
        let chunk = this.getChunk(chunkPos);
        // если чанк найден
        if(!chunk) {
            return null;
        }
        let pos = new Vector(x, y, z);
        let item = {
            id: block.id,
            power: power ? power : 1.0,
            rotate: rotate,
            entity_id: entity_id
        };
        if(is_modify) {
            // @server
            this.world.server.Send({
                name: ServerClient.EVENT_BLOCK_SET,
                data: {
                    pos: pos,
                    item: item
                }
            });
        }
        if(is_modify) {
            let world_block = chunk.getBlock(pos.x, pos.y, pos.z);
            let b = null;
            let action = null;
            if(block.id == BLOCK.AIR.id) {
                // dig
                action = 'dig';
                b = world_block;
            } else {
                // place
                action = 'place';
                b = block;
            }
            b = BLOCK.BLOCK_BY_ID[b.id];
            if(b.hasOwnProperty('sound')) {
                Game.sounds.play(b.sound, action);
            }
        }
        // устанавливаем блок
        return chunk.setBlock(pos.x, pos.y, pos.z, block, false, item.power, item.rotate, item.entity_id);
    }

    // destroyBlock
    destroyBlock(pos, is_modify) {
        let block = this.getBlock(pos.x, pos.y, pos.z);
        if(block.id == BLOCK.TULIP.id) {
            this.world.renderer.setBrightness(.15);
        } else if(block.id == BLOCK.DANDELION.id) {
            this.world.renderer.setBrightness(1);
        } else if(block.id == BLOCK.CACTUS.id) {
            this.world.setRain(true);
        }
        /*
        // @server
        this.world.server.Send({
            name: ServerClient.EVENT_BLOCK_DESTROY,
            data: {
                pos: new Vector(x, y, z)
            }
        });
        */
        this.world.destroyBlock(block, pos);
        this.setBlock(pos.x, pos.y, pos.z, BLOCK.AIR, true);
    }

    // setDirty
    setDirty(pos) {
        let chunk = this.getChunk(pos);
        if(chunk) {
            chunk.dirty = true;
            // Run webworker method
            this.postWorkerMessage(['buildVertices', {
                shift: Game.shift,
                key: chunk.key
            }]);
        }
    }

    // setDirtySimple
    setDirtySimple(pos) {
        let chunk = this.getChunk(pos);
        if(chunk) {
            chunk.dirty = true;
        }
    }

}
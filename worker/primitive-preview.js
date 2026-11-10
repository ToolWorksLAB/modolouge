// Rhino value types are serialized as plain JSON, not archive3dm objects.
function coordinates(p) {
  const v=[p?.X,p?.Y,p?.Z];
  if(!v.every(Number.isFinite)) throw Error('Invalid primitive coordinate');
  return v;
}
function point(plane,x,y,z=0) {
  const o=coordinates(plane?.Origin),a=coordinates(plane?.XAxis),b=coordinates(plane?.YAxis),c=coordinates(plane?.ZAxis);
  const p=o.map((v,i)=>v+x*a[i]+y*b[i]+z*c[i]);
  if(!p.every(Number.isFinite))throw Error('Nonfinite primitive geometry');
  return p;
}
function interval(value) {
  if(!Number.isFinite(value?.T0)||!Number.isFinite(value?.T1)||value.T0>value.T1)throw Error('Invalid primitive interval');
  return [value.T0,value.T1];
}
export function primitivePreview(type,data,layer) {
  if(type==='Rhino.Geometry.Box'){
    const x=interval(data.X),y=interval(data.Y),z=interval(data.Z);
    const corners=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]].map(([i,j,k])=>point(data.Plane,x[i],y[j],z[k]));
    const faces=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
    const vertices=faces.flatMap(([a,b,c,d])=>[a,b,c,a,c,d].flatMap(i=>corners[i]));
    return {kind:'mesh',layer,mesh:{metadata:{version:4.5,type:'BufferGeometry'},data:{attributes:{position:{itemSize:3,type:'Float32Array',array:vertices,normalized:false}}}}};
  }
  if(type==='Rhino.Geometry.Rectangle3d'){
    const x=interval(data.X),y=interval(data.Y);
    return {kind:'curve',layer,points:[[0,0],[1,0],[1,1],[0,1],[0,0]].map(([i,j])=>point(data.Plane,x[i],y[j]))};
  }
  if(type==='Rhino.Geometry.Circle'){
    if(!Number.isFinite(data.Radius)||data.Radius<=0)throw Error('Invalid circle radius');
    return {kind:'curve',layer,points:Array.from({length:161},(_,i)=>point(data.Plane,data.Radius*Math.cos(i*Math.PI/80),data.Radius*Math.sin(i*Math.PI/80)))};
  }
  return null;
}

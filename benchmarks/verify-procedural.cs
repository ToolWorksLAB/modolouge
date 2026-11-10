// Operator-only integration assertions in the staged Rhino runtime.
#r "/usr/lib/rhino3d/Plug-ins/Grasshopper/Grasshopper.dll"
#r "/usr/lib/rhino3d/GH_IO.dll"
using System;
using System.Linq;
using System.Collections.Generic;
using Grasshopper.Kernel;
using Grasshopper.Kernel.Special;
using GH_IO.Serialization;
using Rhino.Geometry;

var checks = new List<string>();
void Check(bool pass,string message){if(!pass)throw new Exception(message);checks.Add(message);}
GH_Document Load(string encoded){var archive=new GH_Archive();Check(archive.Deserialize_Binary(Convert.FromBase64String(encoded)),"Read benchmark archive");var doc=new GH_Document();Check(archive.ExtractObject(doc,"Definition"),"Load benchmark document");doc.Enabled=true;doc.NewSolution(false);return doc;}
GH_Component Component(GH_Document doc,string guid)=>doc.Objects.OfType<GH_Component>().Single(x=>x.ComponentGuid==Guid.Parse(guid));
void SetInput(GH_Document doc,GH_Component component,int index,double value){var slider=component.Params.Input[index].Sources.Single() as GH_NumberSlider;if(slider==null)throw new Exception("Expected a real exposed slider");slider.SetSliderValue((decimal)value);doc.NewSolution(false);}
Surface SurfaceOf(GH_Component component){var raw=component.Params.Output[0].VolatileData.AllData(true).First().ScriptVariable();return raw is Surface s?s:((Brep)raw).Surfaces[0];}
Point3d[] Samples(Surface s)=>Enumerable.Range(1,9).Select(i=>s.PointAt(s.Domain(0).ParameterAt(i/10.0),s.Domain(1).ParameterAt((10-i)/10.0))).ToArray();
using(var doc=Load(noiseAlgo)){
 var noise=Component(doc,"47a5c643-ec4e-4c8b-9d37-9893061980ab");var pop=Component(doc,"69a64ded-ffad-4c66-92d5-3409bf0f3b2b");var sphere=Component(doc,"dabc854d-f50e-408a-b001-d043c7de151d");
 var s=SurfaceOf(noise);var sample=Samples(s);var count=pop.Params.Output[0].VolatileDataCount;var shapes=sphere.Params.Output[0].VolatileData.AllData(true).ToArray();
 Check(count>0&&shapes.Length==count,"One sphere per populated surface point");
 foreach(var shape in shapes){var b=(Brep)shape.ScriptVariable();Check(b.Surfaces[0].TryGetSphere(out var sp),"Output is a sphere");Check(s.ClosestPoint(sp.Center,out var u,out var v)&&s.PointAt(u,v).DistanceTo(sp.Center)<1e-6,"Sphere center lies on noise surface");}
 doc.NewSolution(true);var repeat=Samples(SurfaceOf(noise));Check(sample.Zip(repeat,(a,b)=>a.DistanceTo(b)).All(d=>d<1e-9),"Unchanged seed reproduces the surface");
 var seedSlider=(GH_NumberSlider)noise.Params.Input[4].Sources.Single();var seed=(double)seedSlider.CurrentValue;
 SetInput(doc,noise,4,seed+1);var altered=Samples(SurfaceOf(noise));Check(sample.Zip(altered,(a,b)=>a.DistanceTo(b)).Any(d=>d>1e-4),"Changing seed changes surface heights");
 SetInput(doc,noise,2,0);Check(Samples(SurfaceOf(noise)).All(p=>Math.Abs(p.Z)<1e-9),"Zero noise amplitude is planar");
 var countSlider=(GH_NumberSlider)pop.Params.Input[1].Sources.Single();var target=Math.Min((double)countSlider.Slider.Maximum,count+1);SetInput(doc,pop,1,target);Check(sphere.Params.Output[0].VolatileDataCount==(int)target,"Population control changes sphere count");
}
using(var doc=Load(dimensionsAlgo)){
 var dim=Component(doc,"ef4a82c4-a4bc-44ce-8328-fd58f749cc14");
 double Measurement(int i)=>Convert.ToDouble(dim.Params.Output[i].VolatileData.AllData(true).Single().ScriptVariable());
 var box=BoundingBox.Empty;foreach(var g in dim.Params.Input[0].VolatileData.AllData(true).OfType<Grasshopper.Kernel.Types.IGH_GeometricGoo>())box.Union(g.Boundingbox);
 var original=new[]{Measurement(1),Measurement(2),Measurement(3)};
 Check(Math.Abs(original[0]-(box.Max.X-box.Min.X))<1e-8&&Math.Abs(original[1]-(box.Max.Y-box.Min.Y))<1e-8&&Math.Abs(original[2]-(box.Max.Z-box.Min.Z))<1e-8,"Dimensions equal overall geometry bounds");
 Check(dim.Params.Output[0].VolatileDataCount>15,"Dimension output includes text outlines in addition to extension and tick lines");
 var width=doc.Objects.OfType<GH_NumberSlider>().Single(x=>x.NickName=="X Size");width.SetSliderValue(width.CurrentValue+2);doc.NewSolution(false);
 Check(Math.Abs(Measurement(1)-original[0]-2)<1e-6,"Shelf width dimension follows a two-unit width change");
 Check(Math.Abs(Measurement(2)-original[1])<1e-6,"Width change preserves the depth dimension");
}
report=System.Text.Json.JsonSerializer.Serialize(new{passed=true,checks});

using Grasshopper.Kernel;
using Rhino.Geometry;
using Rhino.DocObjects;
using System.Globalization;

namespace Modolouge.Geometry;

// Reviewed, bounded components. No file/network access or generated source execution.
public sealed class PerlinSurface : GH_Component
{
    public PerlinSurface():base("Perlin Surface","PerlinSrf","Seeded gradient Perlin noise as a smooth NURBS control-point surface. Frequency is cycles per model unit; no octave/fractal approximation.","Modolouge","Procedural"){}
    public override Guid ComponentGuid=>new("47a5c643-ec4e-4c8b-9d37-9893061980ab");
    protected override void RegisterInputParams(GH_InputParamManager p) {
        p.AddNumberParameter("Width","W","Positive X extent",GH_ParamAccess.item,20);
        p.AddNumberParameter("Depth","D","Positive Y extent",GH_ParamAccess.item,20);
        p.AddNumberParameter("Amplitude","A","Height multiplier; zero gives a plane",GH_ParamAccess.item,3);
        p.AddNumberParameter("Frequency","F","Noise cycles per model unit, 0.001 to 10",GH_ParamAccess.item,0.15);
        p.AddIntegerParameter("Seed","S","Repeatable seed",GH_ParamAccess.item,1);
        p.AddIntegerParameter("Resolution","R","Control points per direction, 4 to 64",GH_ParamAccess.item,24);
    }
    protected override void RegisterOutputParams(GH_OutputParamManager p) {p.AddSurfaceParameter("Surface","S","Smooth height-field NURBS surface",GH_ParamAccess.item);}
    protected override void SolveInstance(IGH_DataAccess da) {
        double w=0,d=0,a=0,f=0;int seed=0,n=0;
        if(!da.GetData(0,ref w)||!da.GetData(1,ref d)||!da.GetData(2,ref a)||!da.GetData(3,ref f)||!da.GetData(4,ref seed)||!da.GetData(5,ref n))return;
        if(!new[]{w,d,a,f}.All(double.IsFinite)||w<=0||d<=0||w>10000||d>10000||Math.Abs(a)>10000||f<0.001||f>10||n<4||n>64){AddRuntimeMessage(GH_RuntimeMessageLevel.Error,"Width/depth must be 0..10000, amplitude ±10000, frequency 0.001..10 and resolution 4..64.");return;}
        var noise=new Perlin(seed);var points=new List<Point3d>(n*n);
        for(int i=0;i<n;i++)for(int j=0;j<n;j++){var x=w*i/(n-1);var y=d*j/(n-1);points.Add(new Point3d(x,y,a*noise.At(x*f+0.371,y*f+0.619)));}
        var surface=NurbsSurface.CreateFromPoints(points,n,n,3,3);
        if(surface==null||!surface.IsValid){AddRuntimeMessage(GH_RuntimeMessageLevel.Error,"Could not construct a finite surface.");return;}
        da.SetData(0,surface);
    }
}
public sealed class Perlin
{
    readonly int[] p=new int[512];
    public Perlin(int seed){var values=Enumerable.Range(0,256).ToArray();var r=new Random(seed);for(int i=255;i>0;i--){var j=r.Next(i+1);(values[i],values[j])=(values[j],values[i]);}for(int i=0;i<512;i++)p[i]=values[i&255];}
    static double Fade(double x)=>x*x*x*(x*(x*6-15)+10);
    static double Mix(double a,double b,double t)=>a+(b-a)*t;
    static double Grad(int h,double x,double y)=> (h&7) switch {0=>x,1=>-x,2=>y,3=>-y,4=>(x+y)*0.7071067811865476,5=>(x-y)*0.7071067811865476,6=>(-x+y)*0.7071067811865476,_=>(-x-y)*0.7071067811865476};
    public double At(double x,double y){var xi=(int)Math.Floor(x)&255;var yi=(int)Math.Floor(y)&255;x-=Math.Floor(x);y-=Math.Floor(y);return Mix(Mix(Grad(p[p[xi]+yi],x,y),Grad(p[p[xi+1]+yi],x-1,y),Fade(x)),Mix(Grad(p[p[xi]+yi+1],x,y-1),Grad(p[p[xi+1]+yi+1],x-1,y-1),Fade(x)),Fade(y));}
}
public sealed class PopulateSurface : GH_Component
{
    public PopulateSurface():base("Populate Surface UV","PopSrf","Repeatable random UV samples on an untrimmed surface; not an equal-area or minimum-distance distribution.","Modolouge","Procedural"){}
    public override Guid ComponentGuid=>new("69a64ded-ffad-4c66-92d5-3409bf0f3b2b");
    protected override void RegisterInputParams(GH_InputParamManager p){p.AddSurfaceParameter("Surface","S","Untrimmed surface to sample",GH_ParamAccess.item);p.AddIntegerParameter("Count","N","Point count, 0 to 500",GH_ParamAccess.item,30);p.AddIntegerParameter("Seed","R","Repeatable seed",GH_ParamAccess.item,1);}
    protected override void RegisterOutputParams(GH_OutputParamManager p){p.AddPointParameter("Points","P","Sampled surface positions",GH_ParamAccess.list);p.AddPlaneParameter("Frames","F","Local planes for orienting spheres or panels",GH_ParamAccess.list);}
    protected override void SolveInstance(IGH_DataAccess da){Surface s=null!;int n=0,seed=0;if(!da.GetData(0,ref s)||!da.GetData(1,ref n)||!da.GetData(2,ref seed))return;if(s==null||!s.IsValid||n<0||n>500){AddRuntimeMessage(GH_RuntimeMessageLevel.Error,"Use a valid untrimmed surface and count 0..500.");return;}var r=new Random(seed);var points=new List<Point3d>();var frames=new List<Plane>();for(int i=0;i<n;i++){double u=s.Domain(0).ParameterAt(r.NextDouble()),v=s.Domain(1).ParameterAt(r.NextDouble());if(!s.FrameAt(u,v,out var frame)){AddRuntimeMessage(GH_RuntimeMessageLevel.Error,"Could not compute a surface frame.");return;}points.Add(s.PointAt(u,v));frames.Add(frame);}da.SetDataList(0,points);da.SetDataList(1,frames);}
}
public sealed class BoundsDimensions : GH_Component
{
    public BoundsDimensions():base("Bounds Dimensions","BoundsDim","Live world-axis width, depth and height dimensions. Outputs ordinary curves and outlined text for web previews, plus numeric measurements. Model units are unchanged.","Modolouge","Annotations"){Params.Input[0].DataMapping=GH_DataMapping.Flatten;}
    public override Guid ComponentGuid=>new("ef4a82c4-a4bc-44ce-8328-fd58f749cc14");
    protected override void RegisterInputParams(GH_InputParamManager p){p.AddGeometryParameter("Geometry","G","Final geometry to measure together",GH_ParamAccess.list);p.AddNumberParameter("Offset","O","Dimension offset in model units",GH_ParamAccess.item,1);p.AddNumberParameter("Text Height","H","Text height in model units",GH_ParamAccess.item,0.25);p.AddTextParameter("Unit Suffix","U","Optional label only, e.g. mm; does not convert geometry units",GH_ParamAccess.item,"");}
    protected override void RegisterOutputParams(GH_OutputParamManager p){p.AddCurveParameter("Dimensions","D","Extension lines, dimension lines and outlined labels",GH_ParamAccess.list);p.AddNumberParameter("Width","W","World X extent",GH_ParamAccess.item);p.AddNumberParameter("Depth","Y","World Y extent",GH_ParamAccess.item);p.AddNumberParameter("Height","H","World Z extent",GH_ParamAccess.item);}
    protected override void SolveInstance(IGH_DataAccess da){var input=new List<Grasshopper.Kernel.Types.IGH_GeometricGoo>();double offset=0,h=0;string units="";if(!da.GetDataList(0,input)||!da.GetData(1,ref offset)||!da.GetData(2,ref h)||!da.GetData(3,ref units))return;if(input.Count>2000||!double.IsFinite(offset)||!double.IsFinite(h)||offset<=0||offset>10000||h<=0||h>1000||units.Length>12||units.Any(c=>!char.IsLetter(c)&&c!=' ')){AddRuntimeMessage(GH_RuntimeMessageLevel.Error,"Use <=2000 objects, positive bounded offset/text height and a short alphabetic unit suffix.");return;}var box=BoundingBox.Empty;foreach(var g in input)box.Union(g.Boundingbox);if(!box.IsValid){AddRuntimeMessage(GH_RuntimeMessageLevel.Error,"No finite geometry bounds to measure.");return;}var curves=new List<Curve>();var min=box.Min;var max=box.Max;
        void Dimension(Point3d a,Point3d b,Vector3d shift,Vector3d normal,string label){var aa=a+shift;var bb=b+shift;curves.Add(new LineCurve(a,aa));curves.Add(new LineCurve(b,bb));curves.Add(new LineCurve(aa,bb));var axis=bb-aa;if(!axis.Unitize())return;var cross=Vector3d.CrossProduct(normal,axis);cross.Unitize();foreach(var point in new[]{aa,bb})curves.Add(new LineCurve(point-(axis+cross)*h*0.25,point+(axis+cross)*h*0.25));var plane=new Plane((aa+bb)*0.5+cross*h*0.3,axis,cross);using var style=new DimensionStyle();style.TextHeight=h;using var text=TextEntity.Create(label,plane,style,false,0,0);if(text!=null){var glyphs=text.CreateCurves(style,true);if(glyphs!=null)curves.AddRange(glyphs);}}
        string Label(double value)=>value.ToString("0.###",CultureInfo.InvariantCulture)+(units.Length==0?"":" "+units);
        var width=max.X-min.X;var depth=max.Y-min.Y;var height=max.Z-min.Z;
        Dimension(min,new Point3d(max.X,min.Y,min.Z),new Vector3d(0,-offset,0),Vector3d.ZAxis,Label(width));
        Dimension(min,new Point3d(min.X,max.Y,min.Z),new Vector3d(-offset,0,0),Vector3d.ZAxis,Label(depth));
        Dimension(new Point3d(max.X,min.Y,min.Z),new Point3d(max.X,min.Y,max.Z),new Vector3d(offset,0,0),-Vector3d.YAxis,Label(height));
        da.SetDataList(0,curves);da.SetData(1,width);da.SetData(2,depth);da.SetData(3,height);
    }
}

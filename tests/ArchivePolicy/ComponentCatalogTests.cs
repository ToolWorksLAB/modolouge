using System.Text.Json;
using System.Xml.Linq;

public static class ComponentCatalogTests
{
    public static void Run(Action<bool,string> check)
    {
        var catalog=JsonDocument.Parse(File.ReadAllText("worker/component-catalog.json"));
        var policy=JsonDocument.Parse(File.ReadAllText("worker/component-policy.json")).RootElement.EnumerateArray().Select(x=>x.GetProperty("id").GetString()!).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach(var entry in catalog.RootElement.EnumerateArray()) {
            var obj=ComponentCatalog.Create(entry.GetProperty("id").GetString()!,Guid.NewGuid().ToString(),0);
            var xml=new XDocument(new XElement("archive",new XElement("chunk",new XAttribute("name","DefinitionObjects"),new XElement("chunks",obj))));
            ArchivePolicy.Validate(xml,[obj],policy);
            var graph=GraphReader.Read([obj]);
            check(graph.nodes.Length==1 && graph.notes.Length==0 && graph.wires.Length==0,"Catalog template is valid and disconnected: "+entry.GetProperty("name").GetString());
        }
        XDocument Empty()=>XDocument.Parse("<archive><chunk name='DefinitionObjects'><items><item name='ObjectCount'>0</item></items><chunks /></chunk></archive>");
        var sphere=Guid.NewGuid().ToString();var preview=Guid.NewGuid().ToString();var slider=Guid.NewGuid().ToString();
        var edits=new object[]{new {op="add",nodeId=sphere,text="dabc854d-f50e-408a-b001-d043c7de151d"},new {op="add",nodeId=preview,text=""+catalog.RootElement.EnumerateArray().Single(x=>x.GetProperty("name").GetString()=="Custom Preview").GetProperty("id").GetString()},new {op="add",nodeId=slider,text="57da07bd-ecab-415d-9d86-af36d7073abc"},new {op="slider",nodeId=slider,min=1,max=10,value=3},new {op="connect",nodeId=sphere,input=1,sourceNode=slider,output=0},new {op="connect",nodeId=preview,input=0,sourceNode=sphere,output=0}};
        var doc=Empty();GraphEdits.Apply(doc,JsonSerializer.SerializeToElement(edits));
        var result=GraphReader.Read(doc.Descendants("chunk").Where(x=>(string?)x.Attribute("name")=="Object"));
        check(result.nodes.Length==3 && result.wires.Length==2 && result.notes.Length==0,"Add sphere from scratch and wire radius and preview");
        GraphEdits.Apply(doc,JsonSerializer.SerializeToElement(new object[]{new {op="slider",nodeId=slider,min=0.1,max=5.9,value=2.7},new {op="integer",nodeId=slider}}));
        var savedSlider=doc.Descendants("chunk").Single(x=>(string?)x.Attribute("name")=="Slider");
        string SliderValue(string name)=>savedSlider.Element("items")!.Elements("item").Single(x=>(string?)x.Attribute("name")==name).Value;
        check(SliderValue("Min")=="1"&&SliderValue("Max")=="5"&&SliderValue("Value")=="3"&&SliderValue("Interval")=="1","Integer count control has bounded whole-number values");
        GraphEdits.Apply(doc,JsonSerializer.SerializeToElement(new object[]{new {op="preview",nodeId=preview,value=0}}));
        var preserved=new XDocument(doc);
        GraphEdits.Apply(preserved,JsonSerializer.SerializeToElement(new object[]{new {op="add",nodeId=Guid.NewGuid().ToString(),text="537b0419-bbc2-4ff4-bf08-afe526367b2c"}}));
        var visible=GraphReader.Read(preserved.Descendants("chunk").Where(x=>(string?)x.Attribute("name")=="Object"));
        check(!visible.nodes.Single(x=>x.id==preview).hidden,"Adding a preview preserves previously displayed hidden-fallback geometry");
        var replaced=new XDocument(doc);
        GraphEdits.Apply(replaced,JsonSerializer.SerializeToElement(new object[]{new {op="add",nodeId=Guid.NewGuid().ToString(),text="537b0419-bbc2-4ff4-bf08-afe526367b2c"},new {op="preview",nodeId=preview,value=0}}));
        check(GraphReader.Read(replaced.Descendants("chunk").Where(x=>(string?)x.Attribute("name")=="Object")).nodes.Single(x=>x.id==preview).hidden,"Explicit replacement can still hide old output geometry");
        bool Reject(object[] ops) {try{GraphEdits.Apply(new XDocument(doc),JsonSerializer.SerializeToElement(ops));return false;}catch{return true;}}
        check(Reject([new {op="add",nodeId=Guid.NewGuid().ToString(),text=Guid.NewGuid().ToString()}]),"Uncatalogued component rejected");
        check(Reject([new {op="add",nodeId=sphere.ToUpperInvariant(),text="dabc854d-f50e-408a-b001-d043c7de151d"}]),"Case-insensitive duplicate instance rejected");
        check(Reject([new {op="add",nodeId=Guid.Empty.ToString(),text="dabc854d-f50e-408a-b001-d043c7de151d"}]),"Zero instance identity rejected");
        check(Reject([new {op="connect",nodeId=sphere,input=127,sourceNode=slider,output=0}]),"Nonexistent catalog input rejected");
    }
}

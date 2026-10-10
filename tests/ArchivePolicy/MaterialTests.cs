using System.Xml.Linq;
using System.Text.Json;

static class MaterialTests
{
    const string SwatchId = "11111111-1111-4111-8111-111111111111";
    public static void Run(HashSet<string> policy, Action<bool,string> check, string? benchmark)
    {
        XElement[] Objects(XDocument x) => x.Descendants("chunk").Single(c => (string?)c.Attribute("name") == "DefinitionObjects").Element("chunks")!.Elements("chunk").ToArray();
        XElement Field(XContainer x, string name) => x.Descendants("item").Single(i => (string?)i.Attribute("name") == name);
        XElement Port(XDocument x) => x.Descendants("chunk").Single(c => (string?)c.Attribute("name") == "param_input");
        XDocument Fixture(bool parameterData = false)
        {
            var swatch = XElement.Parse($"<chunk name='Object'><items><item name='GUID'>9c53bac0-ba66-40bd-8154-ce9829b9db1a</item><item name='Name'>Colour Swatch</item></items><chunks><chunk name='Container'><items><item name='InstanceGuid'>{SwatchId}</item><item name='Locked'>false</item></items></chunk></chunks></chunk>");
            var preview = XElement.Parse($"<chunk name='Object'><items><item name='GUID'>537b0419-bbc2-4ff4-bf08-afe526367b2c</item><item name='Name'>Custom Preview</item></items><chunks><chunk name='Container'><items><item name='InstanceGuid'>22222222-2222-4222-8222-222222222222</item><item name='NickName'>Preview</item></items><chunks count='1'><chunk name='param_input' index='1'><items><item name='SourceCount'>1</item><item name='Source' index='0'>{SwatchId}</item></items><chunks count='1'><chunk name='PersistentData'><chunks><chunk name='Branch'><items><item name='rdk_xml'>stale saved defaults</item><item name='rdk_id'>33333333-3333-4333-8333-333333333333</item></items></chunk></chunks></chunk></chunks></chunk></chunks></chunk></chunks></chunk>");
            if (parameterData)
            {
                var chunks = preview.Element("chunks")!.Element("chunk")!.Element("chunks")!;
                var p = chunks.Element("chunk")!; p.Remove(); p.SetAttributeValue("name", "InputParam");
                chunks.Add(new XElement("chunk", new XAttribute("name", "ParameterData"), new XElement("chunks", p)));
            }
            return new XDocument(new XElement("archive", new XElement("chunk", new XAttribute("name", "DefinitionObjects"), new XElement("chunks", swatch, preview))));
        }
        foreach (var modern in new[] { false, true })
        {
            var xml = Fixture(modern);
            var before = Field(xml, "Source").Value;
            check(PreviewMaterials.Normalize(Objects(xml)).Length == 1, "Overridden RDK defaults cleared in " + (modern ? "ParameterData" : "direct port"));
            ArchivePolicy.Validate(xml, Objects(xml), policy);
            check(Field(xml, "Source").Value == before && Objects(xml).Length == 2, "Cleanup preserves graph identities and connections");
            check(!xml.Descendants("chunk").Any(c => (string?)c.Attribute("name") == "PersistentData"), "Only overridden saved defaults removed");
            check(PreviewMaterials.Normalize(Objects(xml)).Length == 0, "Preview normalization is idempotent");
        }
        var cases = new (string, Action<XDocument>)[] {
            ("disconnected M", x => { Field(x,"Source").Remove(); Field(x,"SourceCount").Value="0"; }),
            ("dangling source", x => Field(x,"Source").Value=Guid.NewGuid().ToString()),
            ("count mismatch", x => Field(x,"SourceCount").Value="2"),
            ("locked swatch", x => Field(x,"Locked").Value="true"),
            ("swatch name with different component GUID", x => Objects(x)[0].Element("items")!.Elements("item").First().Value="919e146f-30ae-4aae-be34-4d72f555e7da"),
            ("ambiguous source identity", x => Objects(x)[0].Parent!.Add(new XElement(Objects(x)[0]))),
            ("wrong preview port", x => Port(x).SetAttributeValue("index","0")),
            ("different target component", x => Objects(x)[1].Element("items")!.Elements("item").First().Value="919e146f-30ae-4aae-be34-4d72f555e7da"),
        };
        foreach (var (label, mutate) in cases)
        {
            var xml = Fixture(); mutate(xml); var before = xml.ToString();
            check(PreviewMaterials.Normalize(Objects(xml)).Length == 0 && xml.ToString() == before, "No cleanup for " + label);
            var message = "";
            try { ArchivePolicy.Validate(xml, Objects(xml), policy); } catch (Exception e) { message=e.Message; }
            check(message.Contains("saved Rhino render material") && message.Contains("Preview"), "Material error names affected object: " + label);
        }
        var curve = XElement.Parse("<chunk name='PersistentData'><items><item name='Count'>1</item></items><chunks><chunk name='Branch' index='0'><items><item name='Count'>1</item></items><chunks><chunk name='Item' index='0'><items><item name='TypeName' type_code='10'>Grasshopper.Kernel.Types.GH_Curve</item><item name='RefID' type_code='9'>00000000-0000-0000-0000-000000000000</item><item name='EdgeIndex' type_code='3'>-1</item><item name='ON_Version' type_code='3'>5</item><item name='ON_Data' type_code='20'><stream>AQID</stream></item></items></chunk></chunks></chunk></chunks></chunk>");
        check(PersistedCurves.IsAllowed(curve), "Exact embedded built-in curve metadata accepted");
        var curveCases = new (string, Action<XElement>)[] {
            ("plugin goo", x => Field(x,"TypeName").Value="Plugin.Goo"),
            ("object wrapper", x => Field(x,"TypeName").Value="Grasshopper.Kernel.Types.GH_ObjectWrapper"),
            ("assembly qualified type", x => Field(x,"TypeName").Value += ", Grasshopper"),
            ("external document reference", x => Field(x,"RefID").Value=Guid.NewGuid().ToString()),
            ("wrong field type", x => Field(x,"TypeName").SetAttributeValue("type_code","20")),
            ("missing type", x => Field(x,"TypeName").Remove()),
            ("duplicate type", x => Field(x,"TypeName").Parent!.Add(new XElement(Field(x,"TypeName")))),
            ("unknown field", x => Field(x,"TypeName").Parent!.Add(new XElement("item", new XAttribute("name","PluginPayload"),"data"))),
            ("empty geometry", x => Field(x,"ON_Data").Element("stream")!.Value=""),
            ("unknown binary version", x => Field(x,"ON_Version").Value="999"),
            ("edge reference", x => Field(x,"EdgeIndex").Value="0"),
            ("branch count mismatch", x => x.Element("items")!.Element("item")!.Value="2"),
            ("duplicate branch count", x => x.Element("items")!.Add(new XElement("item",new XAttribute("name","Count"),"1"))),
            ("ambiguous data sections", x => x.Add(new XElement(x.Element("chunks")!))),
            ("ambiguous value sections", x => Field(x,"TypeName").Parent!.Parent!.Add(new XElement(Field(x,"TypeName").Parent!))),
            ("invalid branch index", x => x.Descendants("chunk").First().SetAttributeValue("index","5")),
            ("nested payload", x => Field(x,"TypeName").Parent!.Parent!.Add(new XElement("chunks",new XElement("chunk")))),
        };
        foreach (var (label, mutate) in curveCases) { var x=new XElement(curve); mutate(x); check(!PersistedCurves.IsAllowed(x), "Generic curve gate rejects " + label); }
        if (benchmark == null) return;
        var real=XDocument.Load(benchmark); var objects=Objects(real);
        var beforeGraph=JsonSerializer.Serialize(GraphReader.Read(objects));
        var original=real.ToString();
        check(PreviewMaterials.Normalize(objects).Single().Contains("2 Custom Preview"), "e.gh clears two stale material defaults");
        ArchivePolicy.Validate(real,objects,policy);
        check(JsonSerializer.Serialize(GraphReader.Read(objects)) == beforeGraph, "e.gh retains every node, port, connection and visibility flag");
        check(objects.Length==70, "e.gh retains all 70 saved nodes");
        check(objects.Where(o => o.Element("items")!.Elements("item").Any(i => (string?)i.Attribute("name")=="GUID" && i.Value=="8ec86459-bf01-4409-baee-174d0d2b13d0")).Count(o => o.Descendants("chunk").Any(c => (string?)c.Attribute("name")=="PersistentData"))==3,"e.gh retains all three generic embedded curve parameters");
        check(XDocument.Load(benchmark).ToString()==original,"Original private e.ghx remains unchanged");
    }
}

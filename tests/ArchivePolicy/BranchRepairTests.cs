using System.Xml.Linq;

static class BranchRepairTests
{
    const string Geometry = "919e146f-30ae-4aae-be34-4d72f555e7da", Preview = "537b0419-bbc2-4ff4-bf08-afe526367b2c", Group = "c552a431-af5b-46a9-a8a4-0fcbc27ef596";
    static readonly HashSet<string> Policy = new([Geometry, Preview, Group], StringComparer.OrdinalIgnoreCase);
    static XElement Item(string name, string value) => new("item", new XAttribute("name", name), value);
    static XElement Node(string type, string name, string id, params string[] sources) => new("chunk", new XAttribute("name", "Object"),
        new XElement("items", Item("GUID", type), Item("Name", name)),
        new XElement("chunks", new XElement("chunk", new XAttribute("name", "Container"), new XElement("items", Item("InstanceGuid", id), Item("NickName", name), Item("Hidden", "true"), Item("SourceCount", sources.Length.ToString()), sources.Select(s => Item("Source", s))))));
    static XDocument Fixture()
    {
        var geometry = Node(Geometry, "Geometry", Guid.NewGuid().ToString());
        var preview = Node(Preview, "Custom Preview", Guid.NewGuid().ToString());
        var port = new XElement("chunk", new XAttribute("name", "param_input"), new XAttribute("index", 0), new XElement("items", Item("InstanceGuid", Guid.NewGuid().ToString()), Item("SourceCount", "1"), Item("Source", Id(geometry))));
        Container(preview).Add(new XElement("chunks", port));
        var annotation = Node(Guid.NewGuid().ToString(), "Unsupported annotation", Guid.NewGuid().ToString(), Id(geometry));
        return new XDocument(new XElement("archive", new XElement("chunk", new XAttribute("name", "DefinitionObjects"), new XElement("items", Item("ObjectCount", "3")), new XElement("chunks", geometry, preview, annotation))));
    }
    static XElement Container(XElement o) => o.Element("chunks")!.Elements().Single();
    static string Id(XElement o) => Container(o).Element("items")!.Elements().Single(i => (string?)i.Attribute("name") == "InstanceGuid").Value;
    static XElement List(XDocument x) => x.Root!.Element("chunk")!.Element("chunks")!;
    static void Check(bool ok, string message) { if (!ok) throw new Exception(message); Console.WriteLine("PASS " + message); }
    static void Refuse(Action<XDocument> change, string message)
    {
        var x = Fixture(); change(x); var before = x.ToString();
        Check(BranchRepair.Apply(x, List(x), Policy).Length == 0 && x.ToString() == before, message);
    }
    public static void Run()
    {
        var x = Fixture(); foreach (var list in x.Descendants().Where(e => e.Name == "items" || e.Name == "chunks")) list.SetAttributeValue("count", list.Elements().Count()); var geometry = List(x).Elements().First().ToString();
        Check(BranchRepair.Apply(x, List(x), Policy).Single().Contains("Unsupported annotation"), "Repair explains removed annotation");
        Check(List(x).Elements().Count() == 2 && List(x).Elements().First().ToString().Replace(" index=\"0\"", "") == geometry, "Repair preserves geometry archive and connections");
        ArchivePolicy.Validate(x, List(x).Elements().ToArray(), Policy);
        Check(BranchRepair.Apply(x, List(x), Policy).Length == 0, "Repair is idempotent and supported files unchanged");
        Refuse(x => Container(List(x).Elements().ElementAt(1)).Descendants("item").Single(i => (string?)i.Attribute("name") == "Source").Value = Id(List(x).Elements().Last()), "Required unsupported geometry is never bypassed");
        Refuse(x => List(x).Elements().ElementAt(1).Remove(), "No selected output means no guessed repair");
        Refuse(x => Container(List(x).Elements().ElementAt(1)).Descendants("item").Single(i => (string?)i.Attribute("name") == "Source").Value = Guid.NewGuid().ToString(), "Dangling wire prevents repair");
        Refuse(x => Container(List(x).Elements().Last()).Element("items")!.Elements().Single(i => (string?)i.Attribute("name") == "InstanceGuid").Value = Id(List(x).Elements().First()), "Duplicate identifiers prevent repair");
        Refuse(x => Container(List(x).Elements().Last()).Element("items")!.Elements().Single(i => (string?)i.Attribute("name") == "SourceCount").Value = "7", "Inconsistent source counts prevent repair");
        Refuse(x => x.Root!.Add(new XElement("chunk", new XAttribute("name", "DefinitionObjects"))), "Nested definitions prevent repair");
        Refuse(x => Container(List(x).Elements().ElementAt(1)).Element("items")!.Add(Item("Locked", "true")), "Locked previews do not select outputs");
        Refuse(x => {
            var group = Node(Group, "Group", Guid.NewGuid().ToString());
            var items = Container(group).Element("items")!;
            items.Elements().Single(i => (string?)i.Attribute("name") == "NickName").Value = "RH_OUT:annotation";
            items.Add(Item("ID", Id(List(x).Elements().Last()))); List(x).Add(group);
        }, "Explicit unsupported outputs are protected");
        x = Fixture();
        Container(List(x).Elements().First()).Element("items")!.Add(Item("ScriptSource", "forbidden"));
        BranchRepair.Apply(x, List(x), Policy);
        var rejected = false;
        try { ArchivePolicy.Validate(x, List(x).Elements().ToArray(), Policy); } catch { rejected = true; }
        Check(rejected, "Retained geometry still passes through all security checks");
    }
}

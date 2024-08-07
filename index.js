import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
export class BaseAPI {
  constructor(name="") {
    this.name = name;
  }
  async scrape(url, options, cheerioOptions) {
    return fetch(url, options ? options : {})
    .then(async (res) => {
      const html = await res.text();
      return cheerio.load(html, cheerioOptions ? cheerioOptions : {});
    })
  }
  bundleData(data) {
    return data;
  }
  *generator(data) {
    for (const item of data) {
      yield item;
    }
  }
}

// const express = require('express');
// const app = express();
const port = 1337;
export class ISUEventsAPI extends BaseAPI {
  constructor() {
    super("isuevents");
    this.maps = {
      eventPermaLink: (eventid) => {
        const ps = new URLSearchParams({
          trumbaEmbed: 'view=event', eventid: eventid 
        });
        return `https://www.isu.edu/calendar/?${ps.toString()}` 
      }
    }
  }

  bundleData(data) {
    return {
      findEventById: this.findEventById,
      findEventsByDate: this.findEventsByDate,
      events: super.bundleData(data),
      maps: this.maps
    }
  }
  findEventById(events, eventid) {
    return events.find(event => event.eventId === eventid);
  }
  findEventsByDate(events, date) {
    return events.filter(event => String(event.date).includes(date));
  }
  async getSimpleTable() {
    const url = `https://www.trumba.com/s.aspx?template=table&calendar=isu_event_calendar&widget=main&spudformat=xhr`
    const $ = await super.scrape(url);
    const events = [];
    const eventid = $(ele).find("span.twDescription a").attr("eventid")
    $("table.twSimpleTableTable>tbody>tr").each((idx, ele) => {
      if(ele){
        const event = {
          date: $(ele).find("span.twStartDate").text(),
          time: $(ele).find("span.twStartTime").text(),
          event: $(ele).find("span.twDescription a").text(),
          eventId: eventid,
          location: $(ele).find("span.twLocation").text(),
          permaLink: this.maps.eventPermaLink(eventid)
        }
        if(event.eventId){
          events.push(event)
        }
      }
    })
    return this.bundleData(events);
  }
  async getDetailedTable() {
    const url = `https://www.trumba.com/s.aspx?template=&calendar=isu_event_calendar&widget=main&spudformat=xhr`
    const $ = await super.scrape(url, null, {
      decodeEntities: false
    });
    const events = [];
    let currentEvent = {};
    $("table.twTable>tbody>tr").each((idx, ele) => {
      if($(ele).has(".twRyoPhotoEventsItemHeader").length){
        const headerPiece = $("span.twRyoPhotoEventsItemHeaderDate", ele).html();
        const str_ = headerPiece?.split(" | ") || "";
        currentEvent = {
          date: str_[0] ?? "",
          time:  str_[1] ? String(str_[1]).replace(/&nbsp;/g,' ') : "",
          location: $("span.twLocation", ele).text() || "",
        }
      } else if($(ele).has("td.twContentCell").length) {
          if(currentEvent){
            currentEvent.eventId = $("a", ele).attr("url.eventid");
            currentEvent.description = $(".twRyoPhotoEventsNotes>p", ele).map((jdx, subele) => $(subele).text()).get();
            currentEvent.event = $("span.twRyoPhotoEventsDescription>a", ele).text();
            currentEvent.permaLink = this.maps.eventPermaLink(currentEvent.eventId);
            events.push(currentEvent);
            currentEvent = null;
          }
        } 
      
    })
    return this.bundleData(events);
  }
  async getMonthTable() {
    // const url = `https://www.trumba.com/s.aspx?template=month&calendar=isu_event_calendar&widget=main&spudformat=xhr`;
    const url = `https://www.trumba.com/s.aspx?template=month&calendar=isu_event_calendar&widget=main&date=20240901&spudformat=xhr`;
    const $ = await super.scrape(url);
    // console.log($.html())
    const events = [];
    // fs.writeFileSync('index.html', $.html())
    $(".twMonthHead>table[role='presentation']>tbody>tr").each((idx, ele) => {
      if(ele) {
        console.log(`====================${idx}====================`)
        console.log($(ele).html())
      }
    })
    return events;
  }
  async getEventById(eventid){
    const url = `https://www.trumba.com/s.aspx?template=&view=event&eventid=${eventid}&calendar=isu_event_calendar&widget=main&spudformat=xhr`
    const $ = await super.scrape(url);
    const infoNotes = $("table.twFieldsTable>tbody>tr").map((idx, ele) => ({
      label: $("th.twEDLabel", ele).text(),
      value: $("td.twEDValue", ele).text()
    }));
    const mapLocation = {
      link: $("div.twEDMapWrapper a").attr("href"),
      text: $("div.twEDMapWrapper a").text()
    }
    const res = {
      event: $("span.twEDDescription").text(),
      time: $("span.twEDStartEndRange").text() || "",
      eventId: eventid,
      location: "" || "",
      info: {
        labels: infoNotes.get(),
        description: $(".twEDNotes>p").map((i, e) => $(e).text()).get()
      },
      mapLocation
    }

    return res;
  }

}


const routes = async  (key, value, api) => {
  if (key in api) {
    return await api[key][value]();
  } else {
    return null;
  }
}


export default async function main (params){
  const isuevents = new ISUEventsAPI();
  const apiOptions = {
    [isuevents.name]: {
      simple: isuevents.getSimpleTable.bind(isuevents),
      detailed: isuevents.getDetailedTable.bind(isuevents),
      month: isuevents.getMonthTable.bind(isuevents),
      }
    }
    const result = {};
    for( const [key, value] of Object.entries(params)){
      if (Array.isArray(value)) {
        result[key] = {};
        for (const val of value) {
          result[key][val] = await routes(key, val, apiOptions); 
        }
      } else {
        result[key] = await routes(key, value, apiOptions);
      }
    }
    return result;
    // return Object.entries(params).map(async ([key, value]) => (
    //   {
    //     [key]:
    //      Array.isArray(value)
    //       ? await Promise.all(value.reduce((acc, val) => {
    //           const res_ = routes(key, val, api);
    //           acc.push({[val]: res_});
    //           return acc;
    //       }, [])) 
    //     : {[val]: await routes(key, value, api)}
    //   })  
    // );
}

const params = {
  isuevents: [
    "detailed", 
    // "simple",
    // {'name': 'simple', 'args': {even}}
    // "month",

  ]
};
// main(params).then(async(data) => {
//   const isu = new ISUEventsAPI();
//   const { simple={events: []}, detailed=[], month={events: []}, r=[] } = data.isuevents;
//   console.log(detailed)
//   // if(simple.events.length > 0) {
//   //   const testItems = simple.events.slice(0, 10);
//   //   testItems.map((item) => 
//   //     isu.getEventById(item.eventId).then((data) => {
//   //       console.log(data)
//   //     }).catch((err) => console.log(err))
//   //   )
//   // }
  
// })

// app.listen(port, () => {
//   console.log(`Server is running on port ${port}`);
// })

// app.get('/simple', async (req, res) => {
//   const isu = new ISUEventsAPI();
//   const data = await isu.getSimpleTable();
//   res.json(data);
// });

// module.exports = {
//   ISUEventsAPI
// }
# AI Disclosure Diary
This records every prompt that produced code, a design decision and fixes. 
Tools used: DeepSeek V4.1


Entry 1 — 2026-09-20
Area: app.js file
Prompt: fix the bug in this code by modify the code to returning my Express app. It returns undefined (an empty object)
Output received: Full fixed app.js file with modified line- 
The bug
src/app.js has module.exports = app; — that's right. But look closely at the raw bytes returned by grep:
 module.exports = app;

 What I did with it:Changed the app.js file by adding the new line and run the file again to confirm the Express app is running. 
 How I verified: run the app.js file and got the output - 
 curl http://localhost:3000
                                                                                
StatusCode        : 200                                                          
StatusDescription : OK                                                           
Content           : {"message":"Solar Energy API is running"}     






# TODO LIST

1. 新增`wrap-response.interceptor`，所有接口返回统一json结构（二进制文件内容除外）：

   ```json
   {
     "code": 0, // 业务code，成功：0，其他：失败（要么业务失败报错、要么服务器失败报错），按照业内常见code定义规则来。
     "data": {}, // Object，接口数据
     "msg": "success" // 说明描述信息
   }
   ```

2. 接口日志优化，所有接口请求日志、失败日志记录写入项目`tmp`目录下（关键日志需要在console打印出来），按日切割。日志需要记录关键信息，如：时间戳、method、path、ip、ua、请求耗时、status、message等其他重要信息；如果接口请求失败，需要记录关键stack等。
3. 增加`timeout.interceptor`统一处理超时。抛出标准 HTTP 408 超时异常，由应用的异常过滤器处理
